import { isAbsolute } from 'node:path'
import { createAeroKanbanTools } from '../../cli/aero/aero-kanban-tools'
import { resolveAeroKanbanRoot } from '../../cli/aero/aero-kanban-root'
import { readAeroKanbanPanel } from './aero-kanban-panel'
import type { AeroKanbanPanelSnapshot } from '../../shared/aero/aero-kanban-panel'

const MUTATIONS = new Set([
  'kanban_board_create',
  'kanban_card_add',
  'kanban_card_update',
  'kanban_card_move',
  'kanban_card_remove',
  'kanban_card_link',
  'kanban_card_unlink',
  'kanban_card_answer'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function mutateAeroKanbanPanel(
  given: unknown,
  authorize: (path: string) => Promise<string>
): Promise<AeroKanbanPanelSnapshot> {
  if (!isRecord(given)) {
    throw new Error('Invalid Kanban mutation.')
  }
  const input = given
  if (typeof input.path !== 'string' || !isAbsolute(input.path)) {
    throw new Error('Kanban requires an absolute project path.')
  }
  if (typeof input.tool !== 'string' || !MUTATIONS.has(input.tool)) {
    throw new Error('Unsupported Kanban mutation.')
  }
  if (!isRecord(input.args)) {
    throw new Error('Invalid Kanban mutation arguments.')
  }
  const requested = await authorize(input.path)
  const root = await authorize(await resolveAeroKanbanRoot(requested))
  await createAeroKanbanTools(root, { authorizeRoot: authorize, answerVia: 'user' }).call(
    input.tool,
    input.args
  )
  return readAeroKanbanPanel(root, authorize)
}
