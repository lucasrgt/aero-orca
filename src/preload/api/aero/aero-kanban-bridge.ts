import { ipcRenderer } from 'electron'
import type { AeroKanbanPanelApi } from '../../../shared/aero/aero-kanban-panel'

export const aeroKanbanApi = {
  list: (args) => ipcRenderer.invoke('aeroKanban:list', args)
} satisfies AeroKanbanPanelApi
