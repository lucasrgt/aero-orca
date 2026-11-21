import { access, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

async function resolveExistingRealPath(candidate: string): Promise<string | null> {
  try {
    await access(candidate)
    return await realpath(candidate)
  } catch {
    return null
  }
}

/** Optional read-only mounts for Linux x64 host agent CLIs and auth seeds; non-Linux hosts skip binary mounts. */
export async function collectSandboxHostAgentMounts(): Promise<string[]> {
  const home = homedir()
  const mounts: string[] = []
  const addMount = (hostPath: string, containerPath: string): void => {
    mounts.push('-v', `${hostPath}:${containerPath}:ro`)
  }
  const authFiles: readonly [string, string][] = [
    [join(home, '.claude', '.credentials.json'), '/opt/host-auth/claude-credentials.json'],
    [join(home, '.claude.json'), '/opt/host-auth/claude-state.json'],
    [join(home, '.codex', 'auth.json'), '/opt/host-auth/codex-auth.json'],
    [join(home, '.gemini'), '/opt/host-auth/gemini']
  ]
  for (const [hostPath, containerPath] of authFiles) {
    const resolved = await resolveExistingRealPath(hostPath)
    if (resolved) {
      addMount(resolved, containerPath)
    }
  }
  if (process.platform === 'linux') {
    const claudeBin = await resolveExistingRealPath(join(home, '.local', 'bin', 'claude'))
    if (claudeBin) {
      addMount(claudeBin, '/opt/host-agents/bin/claude')
    }
    const agyBin = await resolveExistingRealPath(join(home, '.local', 'bin', 'agy'))
    if (agyBin) {
      addMount(agyBin, '/opt/host-agents/bin/agy')
    }
    const codexBin = await resolveExistingRealPath(join(home, '.npm-global', 'bin', 'codex'))
    if (codexBin) {
      addMount(dirname(dirname(codexBin)), '/opt/host-agents/codex')
    }
  }
  return mounts
}
