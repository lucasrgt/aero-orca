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
  mutate: (args: {
    path: string
    tool:
      | 'kanban_board_create'
      | 'kanban_card_add'
      | 'kanban_card_update'
      | 'kanban_card_move'
      | 'kanban_card_remove'
      | 'kanban_card_link'
      | 'kanban_card_unlink'
      | 'kanban_card_answer'
    args: Record<string, unknown>
  }) => Promise<AeroKanbanPanelSnapshot>
}
