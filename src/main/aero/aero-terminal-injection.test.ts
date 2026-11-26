import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fact = 'supported' | 'unsupported' | 'unknown'
const state = vi.hoisted(() => {
  const initial: { pluginDirs: Fact; mcpConfigRefused: boolean; ownNames: string[] } = {
    pluginDirs: 'supported',
    mcpConfigRefused: false,
    ownNames: []
  }
  return initial
})

vi.mock('./aero-agent-repo', () => ({ hasAeroAgentData: async () => true }))
vi.mock('./aero-agent-injection', () => ({
  prepareAeroAgentInjection: async () => ({
    pluginDir: '/ud/aero-agent-injection',
    mcpConfigPath: '/ud/aero-agent-injection/mcp.json',
    server: { type: 'stdio', command: '/bin/orca', args: ['aero', 'mcp'] }
  })
}))
vi.mock('../claude/cli-capabilities/claude-cli-flag-support', () => ({
  CLAUDE_CACHED_FLAG_CHECK_BUDGET_MS: 250,
  CLAUDE_PLUGIN_DIR_FLAG: { option: '--plugin-dir', firstVersion: '2.0.25' },
  claudeCliFlagSupport: { check: async () => state.pluginDirs }
}))
vi.mock('../ipc/command-path/command-path-resolver', () => ({
  resolveCommandOnLocalPath: async () => '/bin/claude'
}))
vi.mock('../mcp-servers/agent-own-mcp-server-names', () => ({
  agentOwnMcpServerNames: async () => state.ownNames
}))
vi.mock('../mcp-servers/terminal/terminal-mcp-delivery', () => ({
  claudeRefusesMcpConfig: async () => state.mcpConfigRefused
}))

const { withAeroTerminalInjection } = await import('./aero-terminal-injection')

const base = {
  shell: 'posix' as const,
  cwd: '/repo',
  worktreeId: undefined,
  codexHome: null,
  isLocalFreshLaunch: true
}

function run(launchAgent: 'claude' | 'codex', command: string, env: Record<string, string> = {}) {
  return withAeroTerminalInjection({ ...base, launchAgent, command, env })
}

describe('withAeroTerminalInjection', () => {
  beforeEach(() => {
    state.pluginDirs = 'supported'
    state.mcpConfigRefused = false
    state.ownNames = []
  })

  it('splices the plugin and server into a Claude that takes both', async () => {
    expect(await run('claude', 'claude --model x')).toBe(
      "claude '--plugin-dir' '/ud/aero-agent-injection' '--mcp-config=/ud/aero-agent-injection/mcp.json' --model x"
    )
  })

  it('leaves --plugin-dir out of a Claude too old for it, or not proven new enough', async () => {
    for (const fact of ['unsupported', 'unknown'] as const) {
      state.pluginDirs = fact
      const command = await run('claude', 'claude')
      expect(command).not.toContain('--plugin-dir')
      expect(command).toContain('--mcp-config=')
    }
  })

  it('leaves --mcp-config out when managed settings refuse it', async () => {
    state.mcpConfigRefused = true
    const command = await run('claude', 'claude')
    expect(command).toContain('--plugin-dir')
    expect(command).not.toContain('--mcp-config')
  })

  it('leaves the command alone when neither flag is safe', async () => {
    state.pluginDirs = 'unsupported'
    state.mcpConfigRefused = true
    expect(await run('claude', 'claude --model x')).toBe('claude --model x')
  })

  it('adds no server when the user already has one named knowledge, but keeps the hooks', async () => {
    state.ownNames = ['knowledge']
    const command = await run('claude', 'claude')
    expect(command).toContain('--plugin-dir')
    expect(command).not.toContain('--mcp-config')
    state.ownNames = ['knowledge']
    expect(await run('codex', 'codex')).toBe('codex')
  })

  it('does not add a Codex server that a -c override on the command already names', async () => {
    expect(await run('codex', 'codex -c \'mcp_servers.knowledge.url="http://x"\'')).toBe(
      'codex -c \'mcp_servers.knowledge.url="http://x"\''
    )
  })

  it('rewrites the agent command a setup script runs from its variable, not the script', async () => {
    const env = { ORCA_SEQUENCED_STARTUP_COMMAND: 'claude --resume' }
    const command = await run('claude', 'run-setup.sh', env)
    expect(command).toBe('run-setup.sh')
    expect(env.ORCA_SEQUENCED_STARTUP_COMMAND).toContain("'--plugin-dir'")
    expect(env.ORCA_SEQUENCED_STARTUP_COMMAND.endsWith('--resume')).toBe(true)
  })
})
