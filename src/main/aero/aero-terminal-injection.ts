import { homedir } from 'node:os'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import {
  findAgentExecutableIndex,
  isAgentExecutableToken,
  withArgsAfterAgentExecutable
} from '../../shared/agent-launch/startup/agent-executable-args'
import { findClaudeExecutableIndex } from '../../shared/agent-launch/startup/agent-resume-launch-command'
import { SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV } from '../../shared/agent-launch/startup/setup-agent-sequencing'
import {
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { mcpServerWorkspaceKeyOf } from '../../shared/mcp-servers/mcp-servers'
import {
  CLAUDE_CACHED_FLAG_CHECK_BUDGET_MS,
  CLAUDE_PLUGIN_DIR_FLAG,
  claudeCliFlagSupport
} from '../claude/cli-capabilities/claude-cli-flag-support'
import { codexArgsMcpServerNames } from '../codex/structured/launch/codex-structured-launch-args'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import { agentOwnMcpServerNames } from '../mcp-servers/agent-own-mcp-server-names'
import { mcpServerEntriesForLaunch } from '../mcp-servers/mcp-host-list-launch'
import { isMcpServersFeatureEnabled } from '../mcp-servers/mcp-servers-feature'
import { codexTerminalMcpArgs } from '../mcp-servers/terminal/codex-terminal-mcp-args'
import {
  terminalMcpAdapterFor,
  terminalMcpExecutable
} from '../mcp-servers/terminal/terminal-mcp-adapters'
import {
  claudeRefusesMcpConfig,
  type TerminalMcpLaunch
} from '../mcp-servers/terminal/terminal-mcp-delivery'
import { hasAeroAgentData } from './aero-agent-repo'
import { prepareAeroAgentInjection, type PreparedAeroInjection } from './aero-agent-injection'
import { AERO_KNOWLEDGE_SERVER_NAME } from './aero-injection-plugin'

export type AeroTerminalInjectionInput = {
  command: string | undefined
  launchAgent: TuiAgent | undefined
  shell: AgentStartupShell
  cwd: string | undefined
  /** The spawn's env; a launch after a setup script keeps its agent command in it. */
  env: Record<string, string>
  worktreeId: string | undefined
  codexHome: string | null
  isLocalFreshLaunch: boolean
}

async function hostListServerNames(
  agent: string,
  worktreeId: string | undefined
): Promise<string[]> {
  if (!isMcpServersFeatureEnabled()) {
    return []
  }
  const key = worktreeId ? mcpServerWorkspaceKeyOf(worktreeId) : null
  const { entries } = await mcpServerEntriesForLaunch(agent, { key }).catch(() => ({
    entries: []
  }))
  return entries.map(({ server }) => server.name)
}

/** Every name the run already has: the agent's own config files, the host list, the command line. */
async function takenServerNames(
  input: AeroTerminalInjectionInput,
  agent: 'claude' | 'codex',
  command: string,
  cwd: string
): Promise<string[]> {
  const ownEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...input.env,
    ...(input.codexHome ? { CODEX_HOME: input.codexHome } : {})
  }
  const parsed = agent === 'codex' ? tokenizeStartupCommand(command, input.shell) : null
  const [own, host] = await Promise.all([
    agentOwnMcpServerNames(agent, ownEnv, cwd).catch((): string[] => []),
    hostListServerNames(agent, input.worktreeId)
  ])
  return [...own, ...host, ...(parsed?.ok ? codexArgsMcpServerNames(parsed.tokens) : [])]
}

// Forward slashes spare a bash-flavoured Windows shell from quoting every backslash.
const slashed = (path: string): string => path.replaceAll('\\', '/')

/**
 * The args Claude takes for one run. `--plugin-dir` only for a Claude proven new enough (an older one
 * exits on the unknown option, as does one whose managed settings refuse sideloading), `--mcp-config`
 * only when managed settings allow it and no server is already named `knowledge`.
 */
async function claudeInjectionArgs(
  input: AeroTerminalInjectionInput,
  prepared: PreparedAeroInjection,
  command: string,
  cwd: string
): Promise<string[]> {
  const adapter = terminalMcpAdapterFor('claude')
  const launch: TerminalMcpLaunch = {
    servers: [],
    token: null,
    command,
    shell: input.shell,
    env: input.env,
    cwd
  }
  const executable = adapter && terminalMcpExecutable(adapter, launch)
  if (!executable) {
    return []
  }
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...process.env, ...input.env })) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  const resolved = await resolveCommandOnLocalPath(executable, { env, cwd }).catch(() => null)
  const takesPluginDirs =
    resolved !== null &&
    (await claudeCliFlagSupport.check(
      CLAUDE_PLUGIN_DIR_FLAG,
      { command: resolved, cwd: cwd || homedir(), env },
      CLAUDE_CACHED_FLAG_CHECK_BUDGET_MS
    )) === 'supported'
  const serverFree =
    !(await claudeRefusesMcpConfig(launch, executable)) &&
    !(await takenServerNames(input, 'claude', command, cwd)).includes(AERO_KNOWLEDGE_SERVER_NAME)
  return [
    ...(takesPluginDirs ? ['--plugin-dir', slashed(prepared.pluginDir)] : []),
    ...(serverFree ? [`--mcp-config=${slashed(prepared.mcpConfigPath)}`] : [])
  ]
}

/** Codex dotted overrides merge into a user's same-named server, so a taken name adds nothing. */
async function codexInjectionArgs(
  input: AeroTerminalInjectionInput,
  prepared: PreparedAeroInjection,
  command: string,
  cwd: string
): Promise<string[]> {
  if ((await takenServerNames(input, 'codex', command, cwd)).includes(AERO_KNOWLEDGE_SERVER_NAME)) {
    return []
  }
  const { args, skipped } = codexTerminalMcpArgs(
    [
      {
        name: AERO_KNOWLEDGE_SERVER_NAME,
        command: prepared.server.command,
        args: prepared.server.args
      }
    ],
    input.shell
  )
  return skipped.length === 0 ? args : []
}

/**
 * The terminal command with the plugin and `knowledge` server passed as arguments of this run only,
 * never written into the user's own agent config. Unchanged for another agent, a remote or WSL pane,
 * a restored session, an agent CLI that can't take them, or a command that is not a plain call of it.
 */
export async function withAeroTerminalInjection(
  input: AeroTerminalInjectionInput
): Promise<string | undefined> {
  const { command, launchAgent, cwd } = input
  if (
    !command ||
    !cwd ||
    !input.isLocalFreshLaunch ||
    (launchAgent !== 'claude' && launchAgent !== 'codex') ||
    !(await hasAeroAgentData(cwd))
  ) {
    return command
  }
  // After a setup script the agent's command runs from this variable, as for the host list's servers.
  const sequenced = input.env[SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV]
  const target = sequenced ?? command
  const prepared = await prepareAeroAgentInjection()
  if (!prepared) {
    return command
  }
  const args = await (launchAgent === 'claude' ? claudeInjectionArgs : codexInjectionArgs)(
    input,
    prepared,
    target,
    cwd
  ).catch((error: unknown): string[] => {
    console.warn('[aero] terminal injection skipped; the agent starts without it', error)
    return []
  })
  if (args.length === 0) {
    return command
  }
  const findIndex =
    launchAgent === 'claude'
      ? findClaudeExecutableIndex
      : (tokens: readonly string[], shell: AgentStartupShell) =>
          findAgentExecutableIndex(tokens, shell, (token) =>
            isAgentExecutableToken(token, ['codex'])
          )
  const rewritten =
    withArgsAfterAgentExecutable(
      target,
      input.shell,
      findIndex,
      args.map((arg) => ` ${quoteStartupArg(arg, input.shell)}`).join('')
    ) ?? target
  if (sequenced === undefined) {
    return rewritten
  }
  if (rewritten !== sequenced) {
    input.env[SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV] = rewritten
  }
  return command
}
