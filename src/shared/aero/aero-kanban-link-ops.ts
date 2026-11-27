import { findAeroKanbanCard } from './aero-kanban-card-ops'
import type { AeroKanbanDocument } from './aero-kanban-document'
import {
  makeAeroKanbanRef,
  parseAeroKanbanRef,
  slugifyAeroKanban,
  type AeroKanbanRef
} from './aero-kanban-identifiers'
import { aeroKanbanKeyOrder } from './aero-kanban-schema'
import {
  AeroKanbanError,
  readString,
  readStrings,
  readTables,
  setKnownKey
} from './aero-kanban-tables'
import type { AeroTomlTable } from './aero-toml-document-writer'

export type AeroKanbanBoards = ReadonlyMap<string, AeroKanbanDocument>

const CARD_ORDER = aeroKanbanKeyOrder('card')

function requireRef(ref: string, label: string, hint: string): AeroKanbanRef {
  const parsed = parseAeroKanbanRef(ref)
  if (parsed === null) {
    throw new AeroKanbanError(`bad ${label} ref${hint}`)
  }
  return parsed
}

/** The board stems a link or unlink between these two refs reads and may write. */
export function aeroKanbanLinkStems(upstream: string, downstream: string): string[] {
  const up = requireRef(upstream, 'upstream', ' (want board/cardid)')
  const down = requireRef(downstream, 'downstream', ' (want board/cardid)')
  return [...new Set([slugifyAeroKanban(up.board), slugifyAeroKanban(down.board)])]
}

function addEdge(card: AeroTomlTable, key: 'blocks' | 'blocked_by', ref: string): boolean {
  const edges = readStrings(card, key)
  if (edges.includes(ref)) {
    return false
  }
  setKnownKey(card, key, [...edges, ref], CARD_ORDER)
  return true
}

function dropEdge(card: AeroTomlTable, key: 'blocks' | 'blocked_by', ref: string): boolean {
  const edges = readStrings(card, key)
  if (!edges.includes(ref)) {
    return false
  }
  setKnownKey(
    card,
    key,
    edges.filter((edge) => edge !== ref),
    CARD_ORDER
  )
  return true
}

function missingBoard(sameBoard: boolean, upstreamMissing: boolean): AeroKanbanError {
  if (sameBoard) {
    return new AeroKanbanError('board not found')
  }
  return new AeroKanbanError(
    upstreamMissing ? 'upstream board not found' : 'downstream board not found'
  )
}

/**
 * kanban_card_link: `upstream` blocks `downstream`, stored in both directions so each board file reads
 * standalone. Returns the stems of the boards that changed.
 */
export function linkAeroKanbanCards(
  boards: AeroKanbanBoards,
  upstream: string,
  downstream: string
): Set<string> {
  const up = requireRef(upstream, 'upstream', ' (want board/cardid)')
  const down = requireRef(downstream, 'downstream', ' (want board/cardid)')
  const upRef = makeAeroKanbanRef(up.board, up.card)
  const downRef = makeAeroKanbanRef(down.board, down.card)
  if (upRef === downRef) {
    throw new AeroKanbanError("a card can't block itself")
  }
  const upStem = slugifyAeroKanban(up.board)
  const downStem = slugifyAeroKanban(down.board)
  const upBoard = boards.get(upStem)
  const downBoard = boards.get(downStem)
  if (upBoard === undefined || downBoard === undefined) {
    throw missingBoard(upStem === downStem, upBoard === undefined)
  }
  const upCard = findAeroKanbanCard(upBoard, up.card)
  const downCard = findAeroKanbanCard(downBoard, down.card)
  if (upCard === undefined) {
    throw new AeroKanbanError('upstream card not found')
  }
  if (downCard === undefined) {
    throw new AeroKanbanError('downstream card not found')
  }
  const changed = new Set<string>()
  if (addEdge(upCard, 'blocks', downRef)) {
    changed.add(upStem)
  }
  if (addEdge(downCard, 'blocked_by', upRef)) {
    changed.add(downStem)
  }
  return changed
}

/** kanban_card_unlink: clears the edge on both sides, and any stray copies, wherever the boards exist. */
export function unlinkAeroKanbanCards(
  boards: AeroKanbanBoards,
  upstream: string,
  downstream: string
): Set<string> {
  const up = requireRef(upstream, 'upstream', '')
  const down = requireRef(downstream, 'downstream', '')
  const upRef = makeAeroKanbanRef(up.board, up.card)
  const downRef = makeAeroKanbanRef(down.board, down.card)
  const changed = new Set<string>()
  const upStem = slugifyAeroKanban(up.board)
  const downStem = slugifyAeroKanban(down.board)
  for (const card of readTables(boards.get(upStem)?.tree ?? {}, 'card')) {
    if (dropEdge(card, 'blocks', downRef)) {
      changed.add(upStem)
    }
  }
  for (const card of readTables(boards.get(downStem)?.tree ?? {}, 'card')) {
    if (dropEdge(card, 'blocked_by', upRef)) {
      changed.add(downStem)
    }
  }
  return changed
}

/** Removes every edge that points at a removed card, on every board, so no dangling ref survives. */
export function purgeAeroKanbanRefs(boards: AeroKanbanBoards, gone: string): Set<string> {
  const changed = new Set<string>()
  for (const [stem, board] of boards) {
    for (const card of readTables(board.tree, 'card')) {
      const blockedBy = dropEdge(card, 'blocked_by', gone)
      const blocks = dropEdge(card, 'blocks', gone)
      if (blockedBy || blocks) {
        changed.add(stem)
      }
    }
  }
  return changed
}

export type AeroKanbanUnblock = {
  card: string
  title: string
  ready: boolean
  waiting_on: string[]
  summary: string
}

function isDone(boards: AeroKanbanBoards, ref: string): boolean {
  const parsed = parseAeroKanbanRef(ref)
  const board = parsed === null ? undefined : boards.get(slugifyAeroKanban(parsed.board))
  return (
    parsed !== null &&
    board !== undefined &&
    readTables(board.tree, 'card').some(
      (card) => readString(card, 'id') === parsed.card && readString(card, 'column') === 'done'
    )
  )
}

/**
 * What a card reaching `done` unblocks: for each downstream it blocks, whether that was the last
 * blocker (ready) or others remain. Aero drops an inbox note per downstream; this is the same
 * information, returned to the agent that moved the card.
 */
export function describeAeroKanbanUnblocks(
  boards: AeroKanbanBoards,
  upstreamRef: string,
  upstreamTitle: string,
  downstream: readonly string[]
): AeroKanbanUnblock[] {
  const report: AeroKanbanUnblock[] = []
  for (const ref of downstream) {
    const parsed = parseAeroKanbanRef(ref)
    const board = parsed === null ? undefined : boards.get(slugifyAeroKanban(parsed.board))
    const card =
      parsed === null || board === undefined ? undefined : findAeroKanbanCard(board, parsed.card)
    if (parsed === null || card === undefined) {
      continue
    }
    const title = readString(card, 'title') || parsed.card
    const upstream = upstreamTitle || upstreamRef
    const waiting = readStrings(card, 'blocked_by').filter((blocker) => !isDone(boards, blocker))
    report.push({
      card: ref,
      title,
      ready: waiting.length === 0,
      waiting_on: waiting,
      summary:
        waiting.length === 0
          ? `«${title}» unblocked — ${upstream} done`
          : `${upstream} done — «${title}» still waiting on ${waiting.length} blocker(s)`
    })
  }
  return report
}
