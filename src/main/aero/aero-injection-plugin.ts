import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { quoteStartupArg } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { writePluginFileAtomically } from '../plugins/installation/plugin-atomic-file-write'
import { cmdShimArgument } from '../bots/bot-tools-claude'

/** Same name as AeroFortress gives its server, so the tools are `mcp__knowledge__*` there and here. */
export const AERO_KNOWLEDGE_SERVER_NAME = 'knowledge'
const PLUGIN_NAME = 'aero-agent-injection'
const HOOK_TIMEOUT_SECONDS = 20
const MCP_FILE = 'mcp.json'

export type AeroStdioServer = { type: 'stdio'; command: string; args: string[] }

/** The `orca aero mcp` server, started the way each platform's launcher needs (a .cmd runs through cmd). */
export function aeroKnowledgeServer(launcher: string, platform: NodeJS.Platform): AeroStdioServer {
  const args = ['aero', 'mcp']
  return platform === 'win32' && /\.(cmd|bat)$/i.test(launcher)
    ? { type: 'stdio', command: 'cmd', args: ['/c', launcher, ...args.map(cmdShimArgument)] }
    : { type: 'stdio', command: launcher, args }
}

// Claude Code runs a plugin's hook through bash, also on Windows, where forward slashes are safe.
function hookCommand(launcher: string, platform: NodeJS.Platform, subcommand: string): string {
  const path = platform === 'win32' ? launcher.replaceAll('\\', '/') : launcher
  return `${quoteStartupArg(path, 'posix')} aero hook ${subcommand}`
}

/** The plugin's files by relative path: two hooks and the MCP config a terminal passes by path. */
export function aeroInjectionPluginFiles(
  launcher: string,
  platform: NodeJS.Platform
): Record<string, string> {
  const hook = (subcommand: string): unknown => [
    {
      hooks: [
        {
          type: 'command',
          command: hookCommand(launcher, platform, subcommand),
          timeout: HOOK_TIMEOUT_SECONDS
        }
      ]
    }
  ]
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
  return {
    '.claude-plugin/plugin.json': json({
      name: PLUGIN_NAME,
      version: '1.0.0',
      description:
        'Gives the agent the AeroFortress workspace pack at session start and the Not You Again scars before each prompt.'
    }),
    'hooks/hooks.json': json({
      hooks: {
        SessionStart: hook('session-start'),
        UserPromptSubmit: hook('prompt-submit')
      }
    }),
    [MCP_FILE]: json({
      mcpServers: { [AERO_KNOWLEDGE_SERVER_NAME]: aeroKnowledgeServer(launcher, platform) }
    })
  }
}

export type AeroInjectionPlugin = { pluginDir: string; mcpConfigPath: string }

/** Writes the plugin under `<userData>/aero-agent-injection`, touching only files whose content moved. */
export async function writeAeroInjectionPlugin(
  userDataPath: string,
  launcher: string,
  platform: NodeJS.Platform = process.platform
): Promise<AeroInjectionPlugin> {
  const pluginDir = join(userDataPath, PLUGIN_NAME)
  for (const [relative, contents] of Object.entries(aeroInjectionPluginFiles(launcher, platform))) {
    const target = join(pluginDir, ...relative.split('/'))
    if ((await readFile(target, 'utf8').catch(() => null)) === contents) {
      continue
    }
    await mkdir(join(target, '..'), { recursive: true })
    await writePluginFileAtomically(target, contents)
  }
  return { pluginDir, mcpConfigPath: join(pluginDir, MCP_FILE) }
}
