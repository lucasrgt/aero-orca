import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { APPIMAGE_NODE_RUNTIME_SEGMENTS } from '../../shared/desktop-distribution/appimage/appimage-node-runtime'
import {
  ORCAD_LAUNCHER_FILENAME,
  ORCAD_NODE_RUNTIME_MARKER_FILENAME
} from '../../shared/remote-runtime/orcad-distribution/orcad-artifacts'
import type { NodeRuntimeTarget } from '../../shared/node-runtime/node-runtime-pin'
import { materializeCachedNodeRuntime } from '../node-runtime/pinned-runtime-materializer'

export type LocalSandboxAssets = {
  resourcesDir: string
  orcadDir: string
  nodeBinaryPath: string
  nodeRuntimeSha: string
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function linuxContainerTarget(): NodeRuntimeTarget {
  return process.arch === 'arm64' ? 'linux-arm64-glibc' : 'linux-x64-glibc'
}

async function resolveSandboxResourcesDir(): Promise<string> {
  const appPath = app.getAppPath()
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, 'local-sandbox')] : []),
    join(appPath, 'resources', 'local-sandbox'),
    join(process.cwd(), 'resources', 'local-sandbox')
  ]
  for (const candidate of candidates) {
    if (await pathExists(join(candidate, 'Dockerfile'))) {
      return candidate
    }
  }
  throw new Error(
    `Local sandbox Dockerfile not found (checked ${candidates.join(', ')}). Rebuild or check your Orca checkout.`
  )
}

async function resolveDevOrcadBundle(): Promise<{
  orcadDir: string
  nodeBinaryPath: string
  nodeRuntimeSha: string
} | null> {
  const roots = [app.getAppPath(), process.cwd()]
  for (const root of roots) {
    const orcadDir = join(root, 'out', 'orcad')
    const entry = join(orcadDir, ORCAD_LAUNCHER_FILENAME)
    const markerFile = join(orcadDir, ORCAD_NODE_RUNTIME_MARKER_FILENAME)
    if (!(await pathExists(entry)) || !(await pathExists(markerFile))) {
      continue
    }
    const sha = (await readFile(markerFile, 'utf8')).trim()
    if (!sha) {
      continue
    }
    const nodeBinaryPath = join(root, 'out', 'runtimes', `node-${sha}`, 'bin', 'node')
    if (await pathExists(nodeBinaryPath)) {
      return { orcadDir, nodeBinaryPath, nodeRuntimeSha: sha }
    }
  }
  return null
}

async function resolvePackagedSandboxOrcadBundle(
  target: NodeRuntimeTarget,
  userDataPath: string
): Promise<{
  orcadDir: string
  nodeBinaryPath: string
  nodeRuntimeSha: string
} | null> {
  if (!process.resourcesPath) {
    return null
  }
  const orcadDir = join(process.resourcesPath, 'local-sandbox-orcad')
  const entry = join(orcadDir, ORCAD_LAUNCHER_FILENAME)
  const markerFile = join(orcadDir, ORCAD_NODE_RUNTIME_MARKER_FILENAME)
  if (!(await pathExists(entry)) || !(await pathExists(markerFile))) {
    return null
  }
  const nodeRuntimeSha = (await readFile(markerFile, 'utf8')).trim()
  if (!nodeRuntimeSha) {
    return null
  }
  const bundledNodePath = join(process.resourcesPath, ...APPIMAGE_NODE_RUNTIME_SEGMENTS)
  const nodeBinaryPath =
    process.platform === 'linux' && (await pathExists(bundledNodePath))
      ? bundledNodePath
      : await materializeCachedNodeRuntime(target, join(userDataPath, 'orcad-artifacts'), {})
  return { orcadDir, nodeBinaryPath, nodeRuntimeSha }
}

/** Resolves the sandbox Docker build context plus the Linux orcad and Node 24 bundle to mount in the container. */
export async function resolveLocalSandboxAssets(userDataPath: string): Promise<LocalSandboxAssets> {
  const resourcesDir = await resolveSandboxResourcesDir()
  const devBundle = await resolveDevOrcadBundle()
  if (devBundle) {
    return { resourcesDir, ...devBundle }
  }
  const target = linuxContainerTarget()
  const packagedBundle = await resolvePackagedSandboxOrcadBundle(target, userDataPath)
  if (packagedBundle) {
    return { resourcesDir, ...packagedBundle }
  }
  throw new Error(
    'Could not locate the Linux Orca server bundle (orcad) for the sandbox. In a dev checkout, run "pnpm run build:orcad" first.'
  )
}
