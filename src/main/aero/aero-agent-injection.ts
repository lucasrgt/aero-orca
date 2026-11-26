import { access } from 'node:fs/promises'
import type { Options as ClaudeAgentSdkOptions } from '@anthropic-ai/claude-agent-sdk'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import {
  findAgentExecutableIndex,
  isAgentExecutableToken,
  withArgsAfterAgentExecutable
} from '../../shared/agent-launch/startup/agent-executable-args'
import { findClaudeExecutableIndex } from '../../shared/agent-launch/startup/agent-resume-launch-command'
import {
  quoteStartupArg,
  type AgentStartupShell
} from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { thisAppOrcaCliLauncher } from '../cli/launchers/this-app-orca-cli-launcher'
import {
  CLAUDE_CACHED_FLAG_CHECK_BUDGET_MS,
  CLAUDE_CLI_FLAG_PROBE_KILL_AFTER_MS,
  CLAUDE_MCP_CONFIG_FLAG,
  CLAUDE_PLUGIN_DIR_FLAG
} from '../claude/cli-capabilities/claude-cli-flag-support'
import type { ClaudeStructuredLaunch } from '../claude/structured/launch/claude-structured-launch-resolution'
import { agentOwnMcpServerNames } from '../mcp-servers/agent-own-mcp-server-names'
import type {
  ComposedStructuredLaunch,
  StructuredAgentLaunchResolver
} from '../runtime/agent-session/launch/structured-agent-launch-composition'
import { codexTerminalMcpArgs } from '../mcp-servers/terminal/codex-terminal-mcp-args'
import { hasAeroAgentData } from './aero-agent-repo'
import {
  AERO_KNOWLEDGE_SERVER_NAME,
  aeroKnowledgeServer,
  writeAeroInjectionPlugin,
  type AeroInjectionPlugin,
  type AeroStdioServer
} from './aero-injection-plugin'

type PreparedInjection = AeroInjectionPlugin & { server: AeroStdioServer }

/**
 * The bundled plugin and the `knowledge` server for an agent opened in `cwd`; null with no
 * AeroFortress data there or no `orca` launcher on this host. Injection never stops an agent starting.
 */
async function prepareAeroAgentInjection(cwd: string): Promise<PreparedInjection | null> {
  if (!hasAppEnvironment() || !(await hasAeroAgentData(cwd))) {
    return null
  }
  try {
    const userDataPath = getAppEnvironment().getPath('userData')
    const launcher = thisAppOrcaCliLauncher(userDataPath)
    if (
      !launcher ||
      !(await access(launcher).then(
        () => true,
        () => false
      ))
    ) {
      return null
    }
    const plugin = await writeAeroInjectionPlugin(userDataPath, launcher)
    return { ...plugin, server: aeroKnowledgeServer(launcher, process.platform) }
  } catch (error) {
    console.warn('[aero] agent injection could not be prepared; the agent starts without it', error)
    return null
  }
}

type AeroClaudeOptions = Pick<
  ClaudeAgentSdkOptions,
  'plugins' | 'mcpServers' | 'mcpServersDelivery'
>

/**
 * What a native chat adds for an AeroFortress repo: the hooks plugin beside the visuals plugin, and
 * the `knowledge` server beside the host list's, unless the user's own Claude config names one or
 * managed settings refuse --mcp-config.
 */
async function aeroClaudeLaunchOptions(
  launch: ComposedStructuredLaunch<ClaudeStructuredLaunch>
): Promise<AeroClaudeOptions> {
  const takesPluginDirs =
    (await launch.cliFlag(CLAUDE_PLUGIN_DIR_FLAG, CLAUDE_CLI_FLAG_PROBE_KILL_AFTER_MS)) ===
    'supported'
  const prepared = takesPluginDirs ? await prepareAeroAgentInjection(launch.cwd) : null
  if (!prepared) {
    return {}
  }
  const mcpConfigRefused =
    (await launch.cliFlag(CLAUDE_MCP_CONFIG_FLAG, CLAUDE_CACHED_FLAG_CHECK_BUDGET_MS, false)) ===
    'unsupported'
  const ownNames = mcpConfigRefused
    ? []
    : await agentOwnMcpServerNames(
        'claude',
        { ...process.env, CLAUDE_CONFIG_DIR: launch.claudeConfigDir },
        launch.cwd
      ).catch((): string[] => [])
  const plugins = [
    ...(launch.options.plugins ?? []),
    { type: 'local' as const, path: prepared.pluginDir }
  ]
  return mcpConfigRefused || ownNames.includes(AERO_KNOWLEDGE_SERVER_NAME)
    ? { plugins }
    : {
        plugins,
        mcpServers: { ...launch.options.mcpServers, [AERO_KNOWLEDGE_SERVER_NAME]: prepared.server },
        mcpServersDelivery: 'argv'
      }
}

/** The native chat launch with AeroFortress injection; unchanged for a repo with no AeroFortress data. */
export function withAeroClaudeLaunch(
  resolveLaunch: StructuredAgentLaunchResolver<ClaudeStructuredLaunch>
): StructuredAgentLaunchResolver<ClaudeStructuredLaunch> {
  return async (request) => {
    const launch = await resolveLaunch(request)
    return { ...launch, options: { ...launch.options, ...(await aeroClaudeLaunchOptions(launch)) } }
  }
}

/** The args this agent's CLI takes for one run: the plugin and server for Claude, the server for Codex. */
function terminalInjectionArgs(
  agent: TuiAgent,
  prepared: PreparedInjection,
  shell: AgentStartupShell
): string[] | null {
  if (agent === 'claude') {
    // Forward slashes spare a bash-flavoured Windows shell from quoting every backslash.
    const slashed = (path: string): string => path.replaceAll('\\', '/')
    return [
      '--plugin-dir',
      slashed(prepared.pluginDir),
      `--mcp-config=${slashed(prepared.mcpConfigPath)}`
    ]
  }
  if (agent === 'codex') {
    const { args, skipped } = codexTerminalMcpArgs(
      [
        {
          name: AERO_KNOWLEDGE_SERVER_NAME,
          command: prepared.server.command,
          args: prepared.server.args
        }
      ],
      shell
    )
    return skipped.length === 0 ? args : null
  }
  return null
}

/**
 * The terminal command with the plugin and `knowledge` server passed as arguments of this run only,
 * never written into the user's own agent config. Unchanged for another agent, a remote or WSL pane,
 * a restored session, or a command that is not a plain call of the CLI.
 */
export async function withAeroTerminalInjection(input: {
  command: string | undefined
  launchAgent: TuiAgent | undefined
  shell: AgentStartupShell
  cwd: string | undefined
  isLocalFreshLaunch: boolean
}): Promise<string | undefined> {
  const { command, launchAgent, cwd } = input
  if (
    !command ||
    !cwd ||
    !input.isLocalFreshLaunch ||
    (launchAgent !== 'claude' && launchAgent !== 'codex')
  ) {
    return command
  }
  const prepared = await prepareAeroAgentInjection(cwd)
  const args = prepared && terminalInjectionArgs(launchAgent, prepared, input.shell)
  if (!args) {
    return command
  }
  const findIndex =
    launchAgent === 'claude'
      ? findClaudeExecutableIndex
      : (tokens: readonly string[], shell: AgentStartupShell) =>
          findAgentExecutableIndex(tokens, shell, (token) =>
            isAgentExecutableToken(token, ['codex'])
          )
  return (
    withArgsAfterAgentExecutable(
      command,
      input.shell,
      findIndex,
      args.map((arg) => ` ${quoteStartupArg(arg, input.shell)}`).join('')
    ) ?? command
  )
}
