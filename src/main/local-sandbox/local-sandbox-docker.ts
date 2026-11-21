import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import type {
  LocalSandboxDockerCheck,
  LocalSandboxGeometry,
  LocalSandboxStatus
} from '../../shared/local-sandbox/local-sandbox-types'
import { collectSandboxHostAgentMounts } from './local-sandbox-host-agent-mounts'

const SANDBOX_IMAGE = 'orca-local-sandbox:latest'
const IMAGE_HASH_LABEL = 'orca.sandbox.hash'
const DOCKER_BUILD_TIMEOUT_MS = 10 * 60 * 1000
const DOCKER_COMMAND_TIMEOUT_MS = 60 * 1000
const ORCAD_READY_TIMEOUT_MS = 60 * 1000
const ORCAD_POLL_INTERVAL_MS = 300

async function runDocker(
  args: readonly string[],
  timeoutMs = DOCKER_COMMAND_TIMEOUT_MS
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  const result = await runProcess(
    {
      program: 'docker',
      args: [...args],
      timeoutMs
    },
    'tail'
  )
  return {
    ok: result.code === 0 && !result.timedOut,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    code: result.code
  }
}

export async function checkDockerAvailability(): Promise<LocalSandboxDockerCheck> {
  try {
    const result = await runDocker(['info', '--format', '{{.ServerVersion}}'], 10_000)
    if (result.ok && result.stdout) {
      return { available: true, version: result.stdout }
    }
    return {
      available: false,
      error: result.stderr || 'Docker daemon is not running or not accessible.'
    }
  } catch (error) {
    return {
      available: false,
      error:
        error instanceof Error
          ? error.message
          : 'Docker CLI was not found on PATH. Install Docker to create local sandboxes.'
    }
  }
}

async function computeResourcesHash(resourcesDir: string): Promise<string> {
  const hash = createHash('sha256')
  for (const filename of ['Dockerfile', 'start.sh', 'openbox-autostart']) {
    hash.update(filename)
    hash.update('\0')
    hash.update(await readFile(join(resourcesDir, filename)))
  }
  return hash.digest('hex').slice(0, 16)
}

export async function ensureSandboxDockerImage(
  resourcesDir: string,
  onBuilding: () => void
): Promise<void> {
  const expectedHash = await computeResourcesHash(resourcesDir)
  const inspect = await runDocker(
    [
      'image',
      'inspect',
      '--format',
      `{{index .Config.Labels "${IMAGE_HASH_LABEL}"}}`,
      SANDBOX_IMAGE
    ],
    10_000
  )
  if (inspect.ok && inspect.stdout === expectedHash) {
    return
  }
  onBuilding()
  const build = await runDocker(
    ['build', '--label', `${IMAGE_HASH_LABEL}=${expectedHash}`, '-t', SANDBOX_IMAGE, resourcesDir],
    DOCKER_BUILD_TIMEOUT_MS
  )
  if (!build.ok) {
    throw new Error(`Docker image build failed: ${build.stderr || build.stdout || 'unknown error'}`)
  }
}

export async function allocateLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer()
    server.unref()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((closeError) => {
        if (closeError) {
          rejectPort(closeError)
          return
        }
        if (port <= 0) {
          rejectPort(new Error('Failed to allocate a free local port.'))
          return
        }
        resolvePort(port)
      })
    })
  })
}

export async function startNewSandboxContainer(args: {
  containerName: string
  volumeName: string
  sandboxName: string
  orcadPort: number
  novncPort: number
  vncPort: number
  geometry: LocalSandboxGeometry
  shareHostAgents: boolean
  orcadDir: string
  nodeBinaryPath: string
  nodeRuntimeSha: string
}): Promise<void> {
  await runDocker(['rm', '-f', args.containerName], 15_000).catch(() => {})
  const hostAgentMounts = args.shareHostAgents ? await collectSandboxHostAgentMounts() : []
  const runArgs = [
    'run',
    '-d',
    '--name',
    args.containerName,
    '--hostname',
    args.containerName,
    '--restart',
    'unless-stopped',
    '--shm-size',
    '1g',
    '-e',
    `SANDBOX_GEOMETRY=${args.geometry}`,
    '-e',
    `SANDBOX_NAME=${args.sandboxName}`,
    '-e',
    `ORCAD_PORT=${String(args.orcadPort)}`,
    '-p',
    `127.0.0.1:${String(args.orcadPort)}:${String(args.orcadPort)}`,
    '-p',
    `127.0.0.1:${String(args.novncPort)}:6080`,
    '-p',
    `127.0.0.1:${String(args.vncPort)}:5901`,
    '-v',
    `${args.orcadDir}:/opt/orca/orcad:ro`,
    '-v',
    `${args.nodeBinaryPath}:/opt/orca/runtimes/node-${args.nodeRuntimeSha}/bin/node:ro`,
    '-v',
    `${args.nodeBinaryPath}:/opt/orca/node/bin/node:ro`,
    '-v',
    `${args.volumeName}:/home/user`,
    ...hostAgentMounts,
    SANDBOX_IMAGE
  ]
  const started = await runDocker(runArgs, 30_000)
  if (!started.ok) {
    throw new Error(
      `Failed to start sandbox container: ${started.stderr || started.stdout || 'unknown error'}`
    )
  }
}

function parseOrcadPairingUrl(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        parsed.type === 'orca_server_ready' &&
        'pairing' in parsed &&
        typeof parsed.pairing === 'object' &&
        parsed.pairing !== null &&
        'available' in parsed.pairing &&
        parsed.pairing.available === true &&
        'url' in parsed.pairing &&
        typeof parsed.pairing.url === 'string' &&
        parsed.pairing.url.length > 0
      ) {
        return parsed.pairing.url
      }
    } catch {
      // Ignore partial lines while orcad is still writing stdout.
    }
  }
  return null
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForSandboxOrcadPairingUrl(containerName: string): Promise<string> {
  const deadline = Date.now() + ORCAD_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = await inspectSandboxContainerStatus(containerName)
    if (status !== 'running') {
      const logs = await runDocker(['logs', '--tail', '40', containerName], 10_000)
      throw new Error(
        `Sandbox container exited before Orca server became ready: ${logs.stderr || logs.stdout || status}`
      )
    }
    const read = await runDocker(
      ['exec', containerName, 'cat', '/tmp/sandbox/orcad-readiness.json'],
      5_000
    )
    if (read.ok && read.stdout) {
      const url = parseOrcadPairingUrl(read.stdout)
      if (url) {
        return url
      }
    }
    await delay(ORCAD_POLL_INTERVAL_MS)
  }
  const orcadLog = await runDocker(
    ['exec', containerName, 'tail', '-n', '40', '/tmp/sandbox/orcad.log'],
    5_000
  )
  throw new Error(
    `Timed out waiting for Orca server inside the sandbox.${orcadLog.stdout ? `\n${orcadLog.stdout}` : ''}`
  )
}

export async function inspectSandboxContainerStatus(
  containerName: string
): Promise<LocalSandboxStatus> {
  const result = await runDocker(['inspect', '-f', '{{.State.Running}}', containerName], 10_000)
  if (!result.ok) {
    return 'missing'
  }
  return result.stdout === 'true' ? 'running' : 'stopped'
}

export async function startExistingSandboxContainer(containerName: string): Promise<void> {
  const result = await runDocker(['start', containerName], 30_000)
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || `Failed to start ${containerName}.`)
  }
}

export async function stopSandboxContainer(containerName: string): Promise<void> {
  const result = await runDocker(['stop', containerName], 30_000)
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || `Failed to stop ${containerName}.`)
  }
}

export async function removeSandboxContainer(
  containerName: string,
  volumeName: string,
  deleteVolume: boolean
): Promise<void> {
  await runDocker(['rm', '-f', containerName], 30_000)
  if (deleteVolume) {
    await runDocker(['volume', 'rm', '-f', volumeName], 30_000)
  }
}
