import { access } from 'node:fs/promises'
import type { Options as ClaudeAgentSdkOptions } from '@anthropic-ai/claude-agent-sdk'
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
import {
  composeStructuredLaunch,
  type ComposedStructuredLaunch,
  type StructuredAgentLaunchResolver
} from '../runtime/agent-session/launch/structured-agent-launch-composition'
import { hasAeroAgentData } from './aero-agent-repo'
import {
  AERO_KNOWLEDGE_SERVER_NAME,
  aeroKnowledgeServer,
  writeAeroInjectionPlugin,
  type AeroInjectionPlugin,
  type AeroStdioServer
} from './aero-injection-plugin'

export type PreparedAeroInjection = AeroInjectionPlugin & { server: AeroStdioServer }

/**
 * The generated plugin and the `knowledge` server for this host; null without an `orca` launcher or
 * app environment. The caller has already found AeroFortress data. Injection never stops an agent
 * starting.
 */
export async function prepareAeroAgentInjection(): Promise<PreparedAeroInjection | null> {
  if (!hasAppEnvironment()) {
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

// A bot's look-around and reply-only runs carry these; an injected plugin or server is not theirs to add.
function isReadOnlyClaudeLaunch(options: ClaudeAgentSdkOptions): boolean {
  return (
    options.strictMcpConfig === true ||
    options.disallowedTools !== undefined ||
    options.hooks !== undefined
  )
}

/**
 * What a native chat adds for an AeroFortress repo: the hooks plugin beside the visuals plugin, and
 * the `knowledge` server beside the host list's, unless the host list, the user's own Claude config
 * or a project `.mcp.json` already names one, or managed settings refuse --mcp-config.
 */
async function aeroClaudeLaunchOptions(
  launch: ComposedStructuredLaunch<ClaudeStructuredLaunch>
): Promise<AeroClaudeOptions> {
  if (isReadOnlyClaudeLaunch(launch.options) || !(await hasAeroAgentData(launch.cwd))) {
    return {}
  }
  const takesPluginDirs =
    (await launch.cliFlag(CLAUDE_PLUGIN_DIR_FLAG, CLAUDE_CLI_FLAG_PROBE_KILL_AFTER_MS)) ===
    'supported'
  const prepared = takesPluginDirs ? await prepareAeroAgentInjection() : null
  if (!prepared) {
    return {}
  }
  const plugins = [
    ...(launch.options.plugins ?? []),
    { type: 'local' as const, path: prepared.pluginDir }
  ]
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
  const taken =
    mcpConfigRefused ||
    ownNames.includes(AERO_KNOWLEDGE_SERVER_NAME) ||
    Object.hasOwn(launch.options.mcpServers ?? {}, AERO_KNOWLEDGE_SERVER_NAME)
  return taken
    ? { plugins }
    : {
        plugins,
        mcpServers: { ...launch.options.mcpServers, [AERO_KNOWLEDGE_SERVER_NAME]: prepared.server },
        mcpServersDelivery: 'argv'
      }
}

/** `composeStructuredLaunch` for Claude, then the AeroFortress injection; unchanged outside an AeroFortress repo. */
export function composeAeroClaudeLaunch(
  ...args: Parameters<typeof composeStructuredLaunch<ClaudeStructuredLaunch>>
): StructuredAgentLaunchResolver<ClaudeStructuredLaunch> {
  const resolveLaunch = composeStructuredLaunch(...args)
  return async (request) => {
    const launch = await resolveLaunch(request)
    return {
      ...launch,
      options: { ...launch.options, ...(await aeroClaudeLaunchOptions(launch)) }
    }
  }
}
