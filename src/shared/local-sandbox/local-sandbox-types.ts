export const LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL = 'localSandboxes:createProgress'

export const LOCAL_SANDBOX_GEOMETRIES = ['1280x720', '1600x900', '1920x1080'] as const
export type LocalSandboxGeometry = (typeof LOCAL_SANDBOX_GEOMETRIES)[number]

export type LocalSandboxStatus = 'running' | 'stopped' | 'missing'

export type LocalSandboxRecord = {
  id: string
  name: string
  environmentId: string
  containerName: string
  volumeName: string
  orcadPort: number
  novncPort: number
  vncPort: number
  geometry: LocalSandboxGeometry
  shareHostAgents: boolean
  createdAt: number
}

export type LocalSandboxSummary = LocalSandboxRecord & {
  status: LocalSandboxStatus
  screenUrl: string
}

export type LocalSandboxDockerCheck = {
  available: boolean
  version?: string
  error?: string
}

export type LocalSandboxCreateStage =
  | 'checking-docker'
  | 'building-image'
  | 'starting-container'
  | 'waiting-for-orcad'
  | 'pairing'

export type LocalSandboxCreateProgress = {
  requestId: string
  stage: LocalSandboxCreateStage
  detail: string
}

export type LocalSandboxCreateRequest = {
  requestId: string
  name: string
  geometry?: LocalSandboxGeometry
  shareHostAgents?: boolean
}

export type LocalSandboxCreateResult =
  | { ok: true; sandbox: LocalSandboxSummary }
  | { ok: false; message: string }

export type LocalSandboxActionResult =
  | { ok: true; sandbox?: LocalSandboxSummary }
  | { ok: false; message: string }

export function localSandboxScreenUrl(novncPort: number): string {
  return `http://127.0.0.1:${String(novncPort)}/vnc.html?autoconnect=1&resize=scale&bell=off`
}
