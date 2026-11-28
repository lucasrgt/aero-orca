import { ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import { readAeroKanbanPanel } from '../aero/aero-kanban-panel'
import { mutateAeroKanbanPanel } from '../aero/aero-kanban-mutation'
import { resolveAuthorizedPath } from './filesystem/access/filesystem-auth'

export function registerAeroKanbanHandlers(store: Store): void {
  ipcMain.handle('aeroKanban:mutate', (_event, args: unknown) =>
    mutateAeroKanbanPanel(args, (path) => resolveAuthorizedPath(path, store))
  )
  ipcMain.handle('aeroKanban:list', (_event, args: unknown) =>
    readAeroKanbanPanel(
      args !== null && typeof args === 'object' && 'path' in args ? args.path : undefined,
      (path) => resolveAuthorizedPath(path, store)
    )
  )
}
