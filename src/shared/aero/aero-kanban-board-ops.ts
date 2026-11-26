import type { AeroKanbanDocument } from './aero-kanban-document'
import { aeroKanbanKeyOrder } from './aero-kanban-schema'
import { AeroKanbanError, readString, readTables, setKnownKey } from './aero-kanban-tables'
import { trimLikeRust } from './aero-kanban-text-hash'

const BOARD_ORDER = aeroKanbanKeyOrder('board')

/** The board's pipeline mode: anything but conveyor or flexible is monolith (kanban.rs `set_board_mode`). */
export function setAeroKanbanBoardMode(document: AeroKanbanDocument, mode: string): void {
  const trimmed = trimLikeRust(mode)
  setKnownKey(
    document.tree,
    'mode',
    trimmed === 'conveyor' || trimmed === 'flexible' ? trimmed : 'monolith',
    BOARD_ORDER
  )
}

/** The board's default pipeline; empty clears it. */
export function setAeroKanbanBoardPipeline(document: AeroKanbanDocument, pipeline: string): void {
  setKnownKey(document.tree, 'pipeline', trimLikeRust(pipeline), BOARD_ORDER)
}

/** One column's stage pipeline (the conveyor); empty clears it. */
export function setAeroKanbanColumnPipeline(
  document: AeroKanbanDocument,
  column: string,
  pipeline: string
): void {
  const found = readTables(document.tree, 'column').find(
    (entry) => readString(entry, 'id') === column
  )
  if (found === undefined) {
    throw new AeroKanbanError('board or column not found')
  }
  setKnownKey(found, 'pipeline', trimLikeRust(pipeline), aeroKanbanKeyOrder('column'))
}
