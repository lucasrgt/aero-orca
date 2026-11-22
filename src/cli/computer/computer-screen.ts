import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import {
  localSandboxScreenUrl,
  type LocalSandboxStatus,
  type LocalScreenEntry
} from '../../shared/local-sandbox/local-sandbox-types'
import {
  buildDockerNovncScreenUrl,
  parseDockerPsNovncRows,
  parseNovncTokenList,
  pickMatchingLocalScreen
} from '../../shared/local-sandbox/local-screen-discovery-utils'
import {
  formatNativeChatScreenDirective,
  isLocalScreenUrl
} from '../../shared/native-chat/visuals/native-chat-visual-directive'
import { getOptionalStringFlag } from '../arguments/flags'
import type { CommandHandler } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'

const DOCKER_TIMEOUT_MS = 4_000

function printLocalOutput<T>(result: T, json: boolean, format: (value: T) => string): void {
  if (json) {
    console.log(JSON.stringify({ ok: true, result }, null, 2))
    return
  }
  console.log(format(result))
}

type StoredSandboxRow = {
  id: string
  name: string
  environmentId: string
  containerName: string
  novncPort: number
  geometry?: string
}

async function runDockerQuiet(args: readonly string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const result = await runProcess(
      {
        program: 'docker',
        args: [...args],
        timeoutMs: DOCKER_TIMEOUT_MS
      },
      'tail'
    )
    return { ok: result.code === 0 && !result.timedOut, stdout: result.stdout.trim() }
  } catch {
    return { ok: false, stdout: '' }
  }
}

async function inspectContainerStatus(containerName: string): Promise<LocalSandboxStatus> {
  const result = await runDockerQuiet(['inspect', '-f', '{{.State.Running}}', containerName])
  if (!result.ok) {
    return 'missing'
  }
  return result.stdout === 'true' ? 'running' : 'stopped'
}

const TOKEN_PROBE_SCRIPT =
  'if [ -d /tmp/pc/tokens ]; then ls -1 /tmp/pc/tokens; elif [ -f /tmp/pc/tokens ]; then cat /tmp/pc/tokens; fi'

async function detectContainerNovncToken(containerName: string): Promise<string | null> {
  const probe = await runDockerQuiet(['exec', containerName, 'sh', '-c', TOKEN_PROBE_SCRIPT])
  if (!probe.ok || !probe.stdout) {
    return null
  }
  return parseNovncTokenList(probe.stdout)
}

async function readStoredSandboxes(userDataPath: string): Promise<StoredSandboxRow[]> {
  try {
    const raw = await readFile(join(userDataPath, 'local-sandboxes.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('sandboxes' in parsed) ||
      !Array.isArray(parsed.sandboxes)
    ) {
      return []
    }
    return parsed.sandboxes.filter(
      (entry): entry is StoredSandboxRow =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.environmentId === 'string' &&
        typeof entry.containerName === 'string' &&
        typeof entry.novncPort === 'number'
    )
  } catch {
    return []
  }
}

async function discoverCliLocalScreens(userDataPath: string): Promise<LocalScreenEntry[]> {
  const stored = await readStoredSandboxes(userDataPath)
  const sandboxEntries: LocalScreenEntry[] = await Promise.all(
    stored.map(async (entry) => ({
      id: entry.id,
      name: entry.name,
      kind: 'sandbox' as const,
      containerName: entry.containerName,
      status: await inspectContainerStatus(entry.containerName),
      screenUrl: localSandboxScreenUrl(entry.novncPort),
      environmentId: entry.environmentId,
      ...(entry.geometry ? { geometry: entry.geometry } : {})
    }))
  )
  const knownContainers = new Set(stored.map((entry) => entry.containerName))
  const ps = await runDockerQuiet(['ps', '--format', '{{.Names}}\t{{.Ports}}'])
  const candidates = ps.ok && ps.stdout ? parseDockerPsNovncRows(ps.stdout, knownContainers) : []
  const dockerEntries: LocalScreenEntry[] = await Promise.all(
    candidates.map(async ({ containerName, novncPort }) => {
      const token = await detectContainerNovncToken(containerName)
      return {
        id: `docker:${containerName}`,
        name: containerName,
        kind: 'docker' as const,
        containerName,
        status: 'running' as const,
        screenUrl: buildDockerNovncScreenUrl(novncPort, token)
      }
    })
  )
  return [...sandboxEntries, ...dockerEntries]
}

export const runComputerScreen: CommandHandler = async ({ flags, client, json }) => {
  const listOnly = flags.get('list') === true
  const explicitUrl = getOptionalStringFlag(flags, 'url')
  const sandboxSelector = getOptionalStringFlag(flags, 'sandbox')
  const title = getOptionalStringFlag(flags, 'title')
  const reason = getOptionalStringFlag(flags, 'reason')

  if (listOnly) {
    const screens = await discoverCliLocalScreens(client.userDataPath)
    printLocalOutput({ screens }, json, ({ screens: items }) =>
      items.length === 0
        ? 'No local PC screens found (start pczinho or a local sandbox).'
        : items
            .map((item) => `${item.name} [${item.kind}, ${item.status}] ${item.screenUrl}`)
            .join('\n')
    )
    return
  }

  if (explicitUrl !== undefined) {
    if (!isLocalScreenUrl(explicitUrl)) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--url must be a loopback http(s) URL with an explicit port (e.g. http://127.0.0.1:6080/...)'
      )
    }
    const directive = formatNativeChatScreenDirective({
      url: explicitUrl,
      sandbox: sandboxSelector ?? null,
      title: title ?? null,
      reason: reason ?? null
    })
    printLocalOutput(
      {
        screen: {
          id: sandboxSelector ?? 'custom',
          name: title ?? sandboxSelector ?? 'PC screen',
          kind: 'docker' as const,
          containerName: sandboxSelector ?? '',
          status: 'running' as const,
          screenUrl: explicitUrl
        },
        directive
      },
      json,
      (value) => [value.directive, `URL: ${value.screen.screenUrl}`].join('\n')
    )
    return
  }

  const screens = await discoverCliLocalScreens(client.userDataPath)
  const matched = pickMatchingLocalScreen(screens, { selector: sandboxSelector })
  if (!matched) {
    throw new RuntimeClientError(
      'not_found',
      sandboxSelector
        ? `No local PC screen matching "${sandboxSelector}" was found.`
        : 'No running local PC screen found. Start pczinho or a local sandbox, or pass --url.'
    )
  }

  const directive = formatNativeChatScreenDirective({
    url: matched.screenUrl,
    sandbox: matched.kind === 'sandbox' ? matched.id : matched.containerName,
    title: title ?? matched.name,
    reason: reason ?? null
  })
  printLocalOutput({ screen: matched, directive }, json, (value) =>
    [
      value.directive,
      `Screen: ${value.screen.name} (${value.screen.kind}, ${value.screen.status})`,
      `URL: ${value.screen.screenUrl}`
    ].join('\n')
  )
}
