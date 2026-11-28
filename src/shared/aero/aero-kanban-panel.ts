export type AeroKanbanPanelCard = {
  id: string
  title: string
  desc: string
  column: string
  priority: string
  subtasks: { title: string; done: boolean }[]
}

export type AeroKanbanPanelBoard = {
  stem: string
  name: string
  columns: { id: string; title: string }[]
  cards: AeroKanbanPanelCard[]
}

export type AeroKanbanPanelSnapshot = {
  root: string
  boards: AeroKanbanPanelBoard[]
  skipped: string[]
}

export type AeroKanbanPanelApi = {
  list: (args: { path: string }) => Promise<AeroKanbanPanelSnapshot>
}
