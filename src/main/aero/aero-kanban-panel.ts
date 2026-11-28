import { isAbsolute } from 'node:path'
import { resolveAeroKanbanRoot } from '../../cli/aero/aero-kanban-root'
import { createAeroKanbanStore } from '../../cli/aero/aero-kanban-store'
import { readString, readStrings, readTables } from '../../shared/aero/aero-kanban-tables'
import type { AeroKanbanPanelSnapshot } from '../../shared/aero/aero-kanban-panel'

export async function readAeroKanbanPanel(
  given: unknown,
  authorize: (path: string) => Promise<string>
): Promise<AeroKanbanPanelSnapshot> {
  if (typeof given !== 'string' || !isAbsolute(given)) {
    throw new Error('Kanban requires an absolute project path.')
  }
  const requested = await authorize(given)
  const root = await authorize(await resolveAeroKanbanRoot(requested))
  const { boards, skipped } = await createAeroKanbanStore(root).readAll()
  return {
    root,
    skipped,
    boards: [...boards.values()].map(({ stem, tree }) => ({
      stem,
      name: readString(tree, 'name') || stem,
      columns: readTables(tree, 'column').map((column) => ({
        id: readString(column, 'id'),
        title: readString(column, 'title')
      })),
      cards: readTables(tree, 'card').map((card) => ({
        id: readString(card, 'id'),
        title: readString(card, 'title'),
        desc: readString(card, 'desc'),
        column: readString(card, 'column'),
        priority: readString(card, 'priority'),
        blockedBy: readStrings(card, 'blocked_by'),
        blocks: readStrings(card, 'blocks'),
        clarifications: readTables(card, 'clarifications').map((question) => ({
          id: readString(question, 'id'),
          question: readString(question, 'question'),
          answer: readString(question, 'answer'),
          options: readStrings(question, 'options')
        })),
        subtasks: readTables(card, 'subtasks').map((subtask) => ({
          title: readString(subtask, 'title'),
          done: subtask.done === true
        }))
      }))
    }))
  }
}
