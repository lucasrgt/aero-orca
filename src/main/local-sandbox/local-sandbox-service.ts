import { randomBytes } from 'node:crypto'
import {
  localSandboxScreenUrl,
  type LocalSandboxActionResult,
  type LocalSandboxCreateProgress,
  type LocalSandboxCreateRequest,
  type LocalSandboxCreateResult,
  type LocalSandboxDockerCheck,
  type LocalSandboxRecord,
  type LocalSandboxSummary
} from '../../shared/local-sandbox/local-sandbox-types'
import { removeEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import { verifyAndAddRuntimeEnvironmentFromPairingCode } from '../ipc/runtime-environments/pairing/runtime-environment-pairing-verification'
import { publishVerifiedPairing } from '../ipc/runtime-environments/pairing/runtime-environment-verified-pairing-publish'
import {
  allocateLoopbackPort,
  checkDockerAvailability,
  ensureSandboxDockerImage,
  inspectSandboxContainerStatus,
  removeSandboxContainer,
  startExistingSandboxContainer,
  startNewSandboxContainer,
  stopSandboxContainer,
  waitForSandboxOrcadPairingUrl
} from './local-sandbox-docker'
import { resolveLocalSandboxAssets } from './local-sandbox-orcad-bundle'
import {
  readLocalSandboxRecords,
  removeLocalSandboxRecord,
  upsertLocalSandboxRecord
} from './local-sandbox-store'

export type LocalSandboxServiceDeps = {
  getUserDataPath: () => string
  invalidateTransport: (environmentId: string) => Promise<void> | void
  emitProgress: (progress: LocalSandboxCreateProgress) => void
}

function slugifySandboxName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return base || 'sandbox'
}

async function toSummary(record: LocalSandboxRecord): Promise<LocalSandboxSummary> {
  const status = await inspectSandboxContainerStatus(record.containerName)
  return {
    ...record,
    status,
    screenUrl: localSandboxScreenUrl(record.novncPort)
  }
}

export async function checkLocalSandboxDocker(): Promise<LocalSandboxDockerCheck> {
  return await checkDockerAvailability()
}

export async function listLocalSandboxes(userDataPath: string): Promise<LocalSandboxSummary[]> {
  const records = await readLocalSandboxRecords(userDataPath)
  return await Promise.all(records.map(toSummary))
}

export async function createLocalSandbox(
  deps: LocalSandboxServiceDeps,
  request: LocalSandboxCreateRequest
): Promise<LocalSandboxCreateResult> {
  const name = request.name.trim()
  if (!name) {
    return { ok: false, message: 'Sandbox name is required.' }
  }
  const geometry = request.geometry ?? '1600x900'
  const shareHostAgents = request.shareHostAgents !== false
  const emit = (stage: LocalSandboxCreateProgress['stage'], detail: string): void => {
    deps.emitProgress({ requestId: request.requestId, stage, detail })
  }

  let containerName: string | null = null
  let volumeName: string | null = null
  try {
    emit('checking-docker', 'Checking Docker and Orca server bundle…')
    const docker = await checkDockerAvailability()
    if (!docker.available) {
      return {
        ok: false,
        message: docker.error ?? 'Docker is required to create a local sandbox.'
      }
    }
    const assets = await resolveLocalSandboxAssets(deps.getUserDataPath())
    await ensureSandboxDockerImage(assets.resourcesDir, () =>
      emit('building-image', 'Building Linux sandbox image (first time takes a couple minutes)…')
    )

    emit('starting-container', 'Starting isolated Linux container…')
    const suffix = randomBytes(3).toString('hex')
    const slug = slugifySandboxName(name)
    const id = `sandbox-${slug}-${suffix}`
    containerName = `orca-${id}`
    volumeName = `${containerName}-home`
    const [orcadPort, novncPort, vncPort] = await Promise.all([
      allocateLoopbackPort(),
      allocateLoopbackPort(),
      allocateLoopbackPort()
    ])

    await startNewSandboxContainer({
      containerName,
      volumeName,
      sandboxName: name,
      orcadPort,
      novncPort,
      vncPort,
      geometry,
      shareHostAgents,
      orcadDir: assets.orcadDir,
      nodeBinaryPath: assets.nodeBinaryPath,
      nodeRuntimeSha: assets.nodeRuntimeSha
    })

    emit('waiting-for-orcad', 'Starting desktop and Orca server inside the sandbox…')
    const pairingCode = await waitForSandboxOrcadPairingUrl(containerName)

    emit('pairing', 'Pairing sandbox with Orca…')
    const userDataPath = deps.getUserDataPath()
    const verified = await verifyAndAddRuntimeEnvironmentFromPairingCode(userDataPath, {
      name,
      pairingCode,
      allowLoopback: true
    })
    if (!verified.ok) {
      await removeSandboxContainer(containerName, volumeName, true).catch(() => {})
      return { ok: false, message: verified.message }
    }
    await publishVerifiedPairing(
      userDataPath,
      verified,
      verified.updatedExisting ? { invalidateTransport: deps.invalidateTransport } : null
    )

    const record: LocalSandboxRecord = {
      id,
      name,
      environmentId: verified.environment.id,
      containerName,
      volumeName,
      orcadPort,
      novncPort,
      vncPort,
      geometry,
      shareHostAgents,
      createdAt: Date.now()
    }
    await upsertLocalSandboxRecord(userDataPath, record)
    return { ok: true, sandbox: await toSummary(record) }
  } catch (error) {
    if (containerName && volumeName) {
      await removeSandboxContainer(containerName, volumeName, true).catch(() => {})
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function startLocalSandbox(
  userDataPath: string,
  id: string
): Promise<LocalSandboxActionResult> {
  const records = await readLocalSandboxRecords(userDataPath)
  const record = records.find((entry) => entry.id === id)
  if (!record) {
    return { ok: false, message: 'Local sandbox not found.' }
  }
  try {
    await startExistingSandboxContainer(record.containerName)
    return { ok: true, sandbox: await toSummary(record) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function stopLocalSandbox(
  userDataPath: string,
  id: string
): Promise<LocalSandboxActionResult> {
  const records = await readLocalSandboxRecords(userDataPath)
  const record = records.find((entry) => entry.id === id)
  if (!record) {
    return { ok: false, message: 'Local sandbox not found.' }
  }
  try {
    await stopSandboxContainer(record.containerName)
    return { ok: true, sandbox: await toSummary(record) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function removeLocalSandbox(
  deps: Pick<LocalSandboxServiceDeps, 'getUserDataPath' | 'invalidateTransport'>,
  args: { id: string; deleteVolume?: boolean }
): Promise<LocalSandboxActionResult> {
  const userDataPath = deps.getUserDataPath()
  const removed = await removeLocalSandboxRecord(userDataPath, args.id)
  if (!removed) {
    return { ok: false, message: 'Local sandbox not found.' }
  }
  try {
    await removeSandboxContainer(
      removed.containerName,
      removed.volumeName,
      args.deleteVolume !== false
    )
    await removeEnvironment(userDataPath, removed.environmentId).catch(() => {})
    await deps.invalidateTransport(removed.environmentId)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
