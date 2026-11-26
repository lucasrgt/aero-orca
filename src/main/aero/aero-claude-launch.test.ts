import { describe, expect, it, vi } from 'vitest'

type LaunchOptions = Record<string, unknown>

const state = vi.hoisted(() => {
  const initial: { options: LaunchOptions; isAeroRepo: boolean } = {
    options: {},
    isAeroRepo: true
  }
  return initial
})

vi.mock('../runtime/agent-session/launch/structured-agent-launch-composition', () => ({
  composeStructuredLaunch: () => async () => ({
    cwd: '/repo',
    claudeConfigDir: '/claude',
    cliFlag: async () => 'supported',
    options: state.options
  })
}))
vi.mock('./aero-agent-repo', () => ({ hasAeroAgentData: async () => state.isAeroRepo }))
vi.mock('../mcp-servers/agent-own-mcp-server-names', () => ({
  agentOwnMcpServerNames: async () => []
}))
vi.mock('../../shared/app-lifecycle/app-environment', () => ({
  hasAppEnvironment: () => true,
  getAppEnvironment: () => ({ getPath: () => '/ud' })
}))
vi.mock('../cli/launchers/this-app-orca-cli-launcher', () => ({
  thisAppOrcaCliLauncher: () => process.execPath
}))
vi.mock('./aero-injection-plugin', async (importOriginal) => ({
  ...(await importOriginal()),
  writeAeroInjectionPlugin: async () => ({
    pluginDir: '/ud/aero-agent-injection',
    mcpConfigPath: '/ud/aero-agent-injection/mcp.json'
  })
}))

const { composeAeroClaudeLaunch } = await import('./aero-agent-injection')

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked composition ignores its arguments
const composeArgs = [] as never as Parameters<typeof composeAeroClaudeLaunch>
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked launch resolver ignores the request
const request = {} as never

async function launchWith(options: LaunchOptions, isAeroRepo = true): Promise<LaunchOptions> {
  state.options = options
  state.isAeroRepo = isAeroRepo
  const launch = await composeAeroClaudeLaunch(...composeArgs)(request)
  return launch.options
}

describe('composeAeroClaudeLaunch', () => {
  it('adds the plugin and the knowledge server to a normal launch in an aero repo', async () => {
    const options = await launchWith({ plugins: [{ type: 'local', path: '/visuals' }] })
    expect(options.plugins).toEqual([
      { type: 'local', path: '/visuals' },
      { type: 'local', path: '/ud/aero-agent-injection' }
    ])
    expect(options.mcpServers).toEqual({ knowledge: expect.objectContaining({ type: 'stdio' }) })
  })

  it('leaves a launch alone outside an aero repo', async () => {
    const given = { plugins: [] }
    expect(await launchWith(given, false)).toEqual(given)
  })

  it.each([
    ['a reply-only run (strictMcpConfig)', { strictMcpConfig: true }],
    ['a read-only run (disallowedTools)', { disallowedTools: ['Bash'] }],
    ['a read-only run (hooks)', { hooks: { PreToolUse: [] } }]
  ])('leaves %s unchanged', async (_name, given) => {
    expect(await launchWith(given)).toEqual(given)
  })
})
