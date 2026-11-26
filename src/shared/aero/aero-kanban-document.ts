import { parseAeroKanbanBoard } from './aero-kanban-board'
import { aeroKanbanKeyOrder } from './aero-kanban-schema'
import { AeroKanbanError, readTables, setKnownKey } from './aero-kanban-tables'
import { parseAeroToml } from './aero-toml-integers'
import {
  isAeroTomlTable,
  renderAeroTomlDocument,
  type AeroTomlTable
} from './aero-toml-document-writer'

/** A board file as a lossless tree: every key it holds survives, in the order it was written. */
export type AeroKanbanDocument = { stem: string; tree: AeroTomlTable }

const DEFAULT_COLUMNS: readonly [string, string][] = [
  ['backlog', 'Backlog'],
  ['doing', 'Doing'],
  ['review', 'Review'],
  ['done', 'Done'],
  ['blocked', 'Blocked']
]

export function defaultAeroKanbanColumns(): AeroTomlTable[] {
  return DEFAULT_COLUMNS.map(([id, title]) => ({ id, title, pipeline: '' }))
}

/** A new board: default columns and no cards, written the way Aero writes a fresh one. */
export function newAeroKanbanDocument(stem: string): AeroKanbanDocument {
  return {
    stem,
    tree: {
      name: stem,
      mode: 'monolith',
      pipeline: '',
      column: defaultAeroKanbanColumns(),
      card: []
    }
  }
}

/** Parses a board for reading; a file Aero would not load is an error, never an empty board. */
export function parseAeroKanbanDocument(raw: string, stem: string): AeroKanbanDocument {
  const checked = parseAeroKanbanBoard(raw, stem)
  if (!checked.ok) {
    throw new AeroKanbanError(
      `board '${stem}' exists but does not parse (${checked.issues.join('; ')}); nothing was written`
    )
  }
  const tree = parseAeroToml(raw)
  if (!isAeroTomlTable(tree)) {
    throw new AeroKanbanError(`board '${stem}' exists but is not a TOML table`)
  }
  return { stem, tree }
}

function firstDifference(original: string, rewritten: string): string {
  let index = 0
  while (index < original.length && original[index] === rewritten[index]) {
    index += 1
  }
  return `line ${original.slice(0, index).split('\n').length}`
}

/**
 * Fail closed: the unchanged tree must serialise back to the exact bytes it came from. Only then is
 * a rewrite guaranteed to change nothing but what an operation touches; otherwise the file is left
 * alone rather than normalised silently.
 */
export function assertAeroKanbanRewriteSafe(raw: string, document: AeroKanbanDocument): void {
  let rewritten: string
  try {
    rewritten = renderAeroTomlDocument(document.tree)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new AeroKanbanError(
      `board '${document.stem}' cannot be rewritten without changing it (${reason}); nothing was written`
    )
  }
  if (rewritten !== raw) {
    throw new AeroKanbanError(
      `board '${document.stem}' is not in the form AeroFortress writes (first difference at ${firstDifference(raw, rewritten)}); refusing to rewrite it, so nothing is normalised silently`
    )
  }
}

/** kanban.rs `load_board_at`: a board without a name takes its file stem, one without columns the defaults. */
export function applyAeroKanbanLoadDefaults(document: AeroKanbanDocument): void {
  const { tree, stem } = document
  const order = aeroKanbanKeyOrder('board')
  if (typeof tree.name !== 'string' || tree.name === '') {
    setKnownKey(tree, 'name', stem, order)
  }
  if (readTables(tree, 'column').length === 0) {
    setKnownKey(tree, 'column', defaultAeroKanbanColumns(), order)
  }
}
