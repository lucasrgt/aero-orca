import { ipcRenderer } from 'electron'
import {
  LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL,
  type LocalSandboxActionResult,
  type LocalSandboxCreateProgress,
  type LocalSandboxCreateRequest,
  type LocalSandboxCreateResult,
  type LocalSandboxDockerCheck,
  type LocalSandboxSummary
} from '../../../shared/local-sandbox/local-sandbox-types'

export type LocalSandboxesPreloadApi = {
  checkDocker: () => Promise<LocalSandboxDockerCheck>
  list: () => Promise<LocalSandboxSummary[]>
  create: (args: LocalSandboxCreateRequest) => Promise<LocalSandboxCreateResult>
  start: (args: { id: string }) => Promise<LocalSandboxActionResult>
  stop: (args: { id: string }) => Promise<LocalSandboxActionResult>
  remove: (args: { id: string; deleteVolume?: boolean }) => Promise<LocalSandboxActionResult>
  onCreateProgress: (callback: (progress: LocalSandboxCreateProgress) => void) => () => void
}

export const localSandboxesApi: LocalSandboxesPreloadApi = {
  checkDocker: () => ipcRenderer.invoke('localSandboxes:checkDocker'),
  list: () => ipcRenderer.invoke('localSandboxes:list'),
  create: (args) => ipcRenderer.invoke('localSandboxes:create', args),
  start: (args) => ipcRenderer.invoke('localSandboxes:start', args),
  stop: (args) => ipcRenderer.invoke('localSandboxes:stop', args),
  remove: (args) => ipcRenderer.invoke('localSandboxes:remove', args),
  onCreateProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: LocalSandboxCreateProgress
    ): void => callback(progress)
    ipcRenderer.on(LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL, listener)
    return () => ipcRenderer.removeListener(LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL, listener)
  }
}
