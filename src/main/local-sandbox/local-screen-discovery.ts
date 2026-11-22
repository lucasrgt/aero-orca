import { runProcess } from '@orca/process-host'
import type { LocalScreenEntry } from '../../shared/local-sandbox/local-sandbox-types'
import {
  buildDockerNovncScreenUrl,
  parseDockerPsNovncRows,
  parseNovncTokenList
} from '../../shared/local-sandbox/local-screen-discovery-utils'
import { listLocalSandboxes } from './local-sandbox-service'

const DOCKER_DISCOVERY_TIMEOUT_MS = 4_000
const TOKEN_PROBE_SCRIPT =
  'if [ -d /tmp/pc/tokens ]; then ls -1 /tmp/pc/tokens; elif [ -f /tmp/pc/tokens ]; then cat /tmp/pc/tokens; fi'

async function runDockerQuiet(args: readonly string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const result = await runProcess(
      {
        program: 'docker',
        args: [...args],
        timeoutMs: DOCKER_DISCOVERY_TIMEOUT_MS
      },
      'tail'
    )
    return { ok: result.code === 0 && !result.timedOut, stdout: result.stdout.trim() }
  } catch {
    return { ok: false, stdout: '' }
  }
}

/** Detect websockify token routing (e.g. pczinho's `/tmp/pc/tokens/main` desk). */
async function detectContainerNovncToken(containerName: string): Promise<string | null> {
  const probe = await runDockerQuiet(['exec', containerName, 'sh', '-c', TOKEN_PROBE_SCRIPT])
  if (!probe.ok || !probe.stdout) {
    return null
  }
  return parseNovncTokenList(probe.stdout)
}

/** Discover running non-Orca Docker containers exposing noVNC on loopback port 6080 (e.g. pczinho). */
export async function discoverDockerNovncScreens(
  excludeContainers?: ReadonlySet<string>
): Promise<LocalScreenEntry[]> {
  const ps = await runDockerQuiet(['ps', '--format', '{{.Names}}\t{{.Ports}}'])
  if (!ps.ok || !ps.stdout) {
    return []
  }
  const candidates = parseDockerPsNovncRows(ps.stdout, excludeContainers)
  return await Promise.all(
    candidates.map(async ({ containerName, novncPort }): Promise<LocalScreenEntry> => {
      const token = await detectContainerNovncToken(containerName)
      return {
        id: `docker:${containerName}`,
        name: containerName,
        kind: 'docker',
        containerName,
        status: 'running',
        screenUrl: buildDockerNovncScreenUrl(novncPort, token)
      }
    })
  )
}

/** List all local virtual PC screens: registered Orca local sandboxes plus running Docker noVNC containers. */
export async function listLocalScreens(userDataPath: string): Promise<LocalScreenEntry[]> {
  const sandboxes = await listLocalSandboxes(userDataPath)
  const sandboxEntries: LocalScreenEntry[] = sandboxes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    kind: 'sandbox',
    containerName: entry.containerName,
    status: entry.status,
    screenUrl: entry.screenUrl,
    environmentId: entry.environmentId,
    geometry: entry.geometry
  }))
  const knownContainers = new Set(sandboxes.map((entry) => entry.containerName))
  const dockerEntries = await discoverDockerNovncScreens(knownContainers)
  return [...sandboxEntries, ...dockerEntries]
}
