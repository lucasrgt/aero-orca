import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { quoteStartupArg } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { writePluginFileAtomically } from '../plugins/installation/plugin-atomic-file-write'
import { quotePowerShellLiteral } from '../../shared/shell/launch/powershell-native-argument'
import { wrapWindowsDirectCmdHookCommand } from '../agent-hooks/installation/commands/windows-direct-cmd-hook-command'
import { wrapWindowsPowerShellEncodedCommand } from '../agent-hooks/installation/commands/windows-powershell-hook-launcher'
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

// Windows hooks run in Git Bash or, without it, PowerShell, so the command must parse in both: a bare
// forward-slash path where the path allows it, else the encoded PowerShell launcher (as upstream's
// managed hooks do). The bash form with a quoted path is a syntax error in PowerShell.
function hookCommand(launcher: string, platform: NodeJS.Platform, subcommand: string): string {
  if (platform !== 'win32') {
    return `${quoteStartupArg(launcher, 'posix')} aero hook ${subcommand}`
  }
  const direct = wrapWindowsDirectCmdHookCommand(launcher)
  return direct
    ? `${direct} aero hook ${subcommand}`
    : wrapWindowsPowerShellEncodedCommand(
        `& ${quotePowerShellLiteral(launcher)} aero hook ${subcommand}; exit $LASTEXITCODE`
      )
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
