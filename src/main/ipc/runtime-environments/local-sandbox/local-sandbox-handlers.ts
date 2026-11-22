import { BrowserWindow, ipcMain } from 'electron'
import {
  LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL,
  type LocalSandboxCreateProgress,
  type LocalSandboxCreateRequest
} from '../../../../shared/local-sandbox/local-sandbox-types'
import {
  checkLocalSandboxDocker,
  createLocalSandbox,
  listLocalSandboxes,
  removeLocalSandbox,
  startLocalSandbox,
  stopLocalSandbox
} from '../../../local-sandbox/local-sandbox-service'
import { listLocalScreens } from '../../../local-sandbox/local-screen-discovery'

export type LocalSandboxHandlerDeps = {
  getUserDataPath: () => string
  invalidateTransport: (environmentId: string) => Promise<void> | void
}

function broadcastCreateProgress(progress: LocalSandboxCreateProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(LOCAL_SANDBOX_CREATE_PROGRESS_CHANNEL, progress)
    }
  }
}

export function registerLocalSandboxHandlers({
  getUserDataPath,
  invalidateTransport
}: LocalSandboxHandlerDeps): void {
  ipcMain.handle('localSandboxes:checkDocker', async () => await checkLocalSandboxDocker())
  ipcMain.handle('localSandboxes:list', async () => await listLocalSandboxes(getUserDataPath()))
  ipcMain.handle(
    'localSandboxes:listScreens',
    async () => await listLocalScreens(getUserDataPath())
  )
  ipcMain.handle(
    'localSandboxes:create',
    async (_event, args: LocalSandboxCreateRequest) =>
      await createLocalSandbox(
        {
          getUserDataPath,
          invalidateTransport,
          emitProgress: broadcastCreateProgress
        },
        args
      )
  )
  ipcMain.handle(
    'localSandboxes:start',
    async (_event, args: { id: string }) => await startLocalSandbox(getUserDataPath(), args.id)
  )
  ipcMain.handle(
    'localSandboxes:stop',
    async (_event, args: { id: string }) => await stopLocalSandbox(getUserDataPath(), args.id)
  )
  ipcMain.handle(
    'localSandboxes:remove',
    async (_event, args: { id: string; deleteVolume?: boolean }) =>
      await removeLocalSandbox({ getUserDataPath, invalidateTransport }, args)
  )
}
