import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hasAeroAgentData } from './aero-agent-repo'
import { aeroInjectionPluginFiles, aeroKnowledgeServer } from './aero-injection-plugin'

type HooksFile = { hooks: Record<string, { hooks: { type: string; command: string }[] }[]> }

function hookCommands(launcher: string, platform: NodeJS.Platform): Record<string, string> {
  const parsed: HooksFile = JSON.parse(
    aeroInjectionPluginFiles(launcher, platform)['hooks/hooks.json']
  )
  return Object.fromEntries(
    Object.entries(parsed.hooks).map(([event, groups]) => [event, groups[0].hooks[0].command])
  )
}

describe('aero injection plugin', () => {
  it('quotes a launcher with spaces for bash and uses forward slashes on Windows', () => {
    expect(hookCommands('/Applications/My Orca/bin/orca', 'darwin')).toEqual({
      SessionStart: "'/Applications/My Orca/bin/orca' aero hook session-start",
      UserPromptSubmit: "'/Applications/My Orca/bin/orca' aero hook prompt-submit"
    })
    expect(hookCommands('C:\\Users\\Ana Maria\\orca-dev.cmd', 'win32').SessionStart).toBe(
      "'C:/Users/Ana Maria/orca-dev.cmd' aero hook session-start"
    )
  })

  it('runs a Windows .cmd launcher through cmd and a native one directly', () => {
    expect(aeroKnowledgeServer('C:\\x\\orca-dev.cmd', 'win32')).toEqual({
      type: 'stdio',
      command: 'cmd',
      args: ['/c', 'C:\\x\\orca-dev.cmd', 'aero', 'mcp']
    })
    expect(aeroKnowledgeServer('C:\\x\\orca.exe', 'win32')).toEqual({
      type: 'stdio',
      command: 'C:\\x\\orca.exe',
      args: ['aero', 'mcp']
    })
  })

  it('names the server knowledge so the tools are mcp__knowledge__*', () => {
    const config: { mcpServers: Record<string, unknown> } = JSON.parse(
      aeroInjectionPluginFiles('/bin/orca', 'linux')['mcp.json']
    )
    expect(Object.keys(config.mcpServers)).toEqual(['knowledge'])
  })
})

describe('hasAeroAgentData', () => {
  let root = ''
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('finds .aerofortress or .nya above the folder and nothing in a plain repo', async () => {
    root = await mkdtemp(join(tmpdir(), 'aero-agent-repo-'))
    const nested = join(root, 'a', 'b')
    await mkdir(nested, { recursive: true })
    expect(await hasAeroAgentData(nested)).toBe(false)
    await mkdir(join(root, 'a', '.nya'))
    expect(await hasAeroAgentData(nested)).toBe(true)
  })
})
