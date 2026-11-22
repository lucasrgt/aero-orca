import { localSandboxScreenUrl, type LocalScreenEntry } from './local-sandbox-types'

const NOVNC_LOOPBACK_PORT_PATTERN = /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):(\d+)->6080\/tcp/

export type DockerNovncCandidate = {
  containerName: string
  novncPort: number
}

/** Build a noVNC screen URL, adding the `main` websockify token when the container uses token routing (e.g. pczinho). */
export function buildDockerNovncScreenUrl(novncPort: number, tokenName?: string | null): string {
  const base = localSandboxScreenUrl(novncPort)
  if (!tokenName) {
    return base
  }
  return `${base}&path=${encodeURIComponent(`websockify?token=${tokenName}`)}`
}

/** Parse either a directory listing (`main`) or token-file lines (`main: localhost:5901`) into the preferred token. */
export function parseNovncTokenList(stdout: string): string | null {
  const tokens: string[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const colon = line.indexOf(':')
    const name = (colon > 0 ? line.slice(0, colon) : line).trim()
    if (/^[A-Za-z0-9._-]+$/.test(name)) {
      tokens.push(name)
    }
  }
  if (tokens.includes('main')) {
    return 'main'
  }
  return tokens[0] ?? null
}

/** Parse `docker ps --format "{{.Names}}\t{{.Ports}}"` output for containers exposing noVNC port 6080. */
export function parseDockerPsNovncRows(
  stdout: string,
  excludeContainers?: ReadonlySet<string>
): DockerNovncCandidate[] {
  const candidates: DockerNovncCandidate[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const tabIndex = line.indexOf('\t')
    if (tabIndex <= 0) {
      continue
    }
    const containerName = line.slice(0, tabIndex).trim()
    const ports = line.slice(tabIndex + 1)
    if (!containerName || excludeContainers?.has(containerName)) {
      continue
    }
    const match = NOVNC_LOOPBACK_PORT_PATTERN.exec(ports)
    if (!match) {
      continue
    }
    const novncPort = Number(match[1])
    if (!Number.isInteger(novncPort) || novncPort < 1 || novncPort > 65_535) {
      continue
    }
    candidates.push({ containerName, novncPort })
  }
  return candidates
}

/** Pick the best matching local screen for a chat or CLI query. */
export function pickMatchingLocalScreen(
  screens: readonly LocalScreenEntry[],
  options: {
    selector?: string | null
    environmentId?: string | null
  } = {}
): LocalScreenEntry | null {
  const selector = options.selector?.trim().toLowerCase()
  if (selector) {
    const exact = screens.find(
      (entry) =>
        entry.id.toLowerCase() === selector ||
        entry.name.toLowerCase() === selector ||
        entry.containerName.toLowerCase() === selector
    )
    if (exact) {
      return exact
    }
    const partial = screens.find(
      (entry) =>
        entry.name.toLowerCase().includes(selector) ||
        entry.containerName.toLowerCase().includes(selector)
    )
    if (partial) {
      return partial
    }
    return null
  }
  if (options.environmentId) {
    const byEnv = screens.find((entry) => entry.environmentId === options.environmentId)
    if (byEnv) {
      return byEnv
    }
  }
  return (
    screens.find((entry) => entry.status === 'running' && entry.kind === 'sandbox') ??
    screens.find((entry) => entry.status === 'running') ??
    screens[0] ??
    null
  )
}
