import type { AeroKanbanDocument } from './aero-kanban-document'
import { newAeroKanbanCardId } from './aero-kanban-identifiers'
import {
  aeroOutcomeFromAgent,
  aeroOutcomeToTable,
  readStoredAeroOutcome,
  type AeroOutcome
} from './aero-kanban-outcome'
import { aeroKanbanKeyOrder } from './aero-kanban-schema'
import {
  AeroKanbanError,
  capChars,
  carryUnknownKeys,
  readString,
  readStrings,
  readTables,
  setKnownKey
} from './aero-kanban-tables'
import { trimLikeRust } from './aero-kanban-text-hash'
import { isAeroTomlTable, type AeroTomlTable } from './aero-toml-document-writer'

const CARD_ORDER = aeroKanbanKeyOrder('card')
const MAX_ANSWER_CHARS = 4000
const OUTCOME_UNREADABLE =
  'the card holds an outcome this reader cannot parse; refusing to replace or clear it'

export type AeroKanbanCardEdit = {
  title?: string
  desc?: string
  pipeline?: string
  priority?: string
  category?: string
  subtasks?: { title: string; done: boolean }[]
  knowledge?: string[]
  clearReadiness?: boolean
  /** undefined keeps the stored outcome, null clears it, an object replaces it. */
  outcome?: AeroOutcome | null
}

export function findAeroKanbanCard(
  document: AeroKanbanDocument,
  cardId: string
): AeroTomlTable | undefined {
  return readTables(document.tree, 'card').find((card) => readString(card, 'id') === cardId)
}

export function requireAeroKanbanCard(document: AeroKanbanDocument, cardId: string): AeroTomlTable {
  const card = findAeroKanbanCard(document, cardId)
  if (card === undefined) {
    throw new AeroKanbanError('board or card not found')
  }
  return card
}

function setCard(card: AeroTomlTable, key: string, value: AeroTomlTable[string]): void {
  setKnownKey(card, key, value, CARD_ORDER)
}

/** A new card in the board's first column, written with every field Aero writes for one. */
export function addAeroKanbanCard(
  document: AeroKanbanDocument,
  input: { title: string; desc: string; pipeline: string },
  stamp: string
): string {
  const columns = readTables(document.tree, 'column')
  const first = columns.length > 0 ? readString(columns[0], 'id') : 'backlog'
  const id = newAeroKanbanCardId(input.title)
  const card: AeroTomlTable = {
    id,
    title: input.title,
    desc: input.desc,
    priority: '',
    category: '',
    subtasks: [],
    attachments: [],
    knowledge: [],
    pipeline: input.pipeline,
    column: first,
    session: '',
    phase: '',
    blocked_by: [],
    blocks: [],
    touched: stamp
  }
  setKnownKey(
    document.tree,
    'card',
    [...readTables(document.tree, 'card'), card],
    aeroKanbanKeyOrder('board')
  )
  return id
}

/** Decides what the outcome becomes (or refuses), before anything on the card changes. */
function planOutcome(card: AeroTomlTable, incoming: AeroOutcome | null): AeroOutcome | null {
  const stored = readStoredAeroOutcome(card)
  if (isAeroTomlTable(card.outcome) && stored === undefined) {
    throw new AeroKanbanError(OUTCOME_UNREADABLE)
  }
  return aeroOutcomeFromAgent(stored, incoming)
}

/**
 * kanban_card_update: only the fields given change, subtasks and knowledge replace the whole list,
 * `touched` is re-stamped. The outcome is checked first, so a refusal leaves the card untouched.
 */
export function updateAeroKanbanCard(
  document: AeroKanbanDocument,
  cardId: string,
  edit: AeroKanbanCardEdit,
  stamp: string
): void {
  const card = requireAeroKanbanCard(document, cardId)
  const outcome = edit.outcome === undefined ? undefined : planOutcome(card, edit.outcome)
  for (const key of ['title', 'desc', 'pipeline', 'priority', 'category'] as const) {
    const value = edit[key]
    if (value !== undefined) {
      setCard(card, key, value)
    }
  }
  setCard(card, 'touched', stamp)
  if (edit.subtasks !== undefined) {
    setCard(
      card,
      'subtasks',
      edit.subtasks.map((subtask) => ({ title: subtask.title, done: subtask.done }))
    )
  }
  if (edit.knowledge !== undefined) {
    setCard(
      card,
      'knowledge',
      edit.knowledge.map(trimLikeRust).filter((id) => id !== '')
    )
  }
  if (edit.clearReadiness === true) {
    delete card.readiness
  }
  if (outcome === null) {
    delete card.outcome
  } else if (outcome !== undefined) {
    const previous = isAeroTomlTable(card.outcome) ? card.outcome : undefined
    setCard(
      card,
      'outcome',
      carryUnknownKeys(aeroOutcomeToTable(outcome, stamp), previous, 'outcome')
    )
  }
}

export type AeroKanbanMove = { title: string; previousColumn: string; blocks: string[] }

/** kanban_card_move: any column id is accepted; `phase` and `session` change only when given. */
export function moveAeroKanbanCard(
  document: AeroKanbanDocument,
  cardId: string,
  move: { column: string; phase?: string; session?: string },
  stamp: string
): AeroKanbanMove {
  const card = requireAeroKanbanCard(document, cardId)
  const before = {
    title: readString(card, 'title'),
    previousColumn: readString(card, 'column'),
    blocks: readStrings(card, 'blocks')
  }
  setCard(card, 'column', move.column)
  if (move.phase !== undefined) {
    setCard(card, 'phase', move.phase)
  }
  if (move.session !== undefined) {
    setCard(card, 'session', move.session)
  }
  setCard(card, 'touched', stamp)
  return before
}

/** Drops the card; a card that is not there is not an error (kanban.rs `remove_card`). */
export function removeAeroKanbanCard(document: AeroKanbanDocument, cardId: string): void {
  const cards = document.tree.card
  if (Array.isArray(cards)) {
    setKnownKey(
      document.tree,
      'card',
      cards.filter((card) => !isAeroTomlTable(card) || readString(card, 'id') !== cardId),
      aeroKanbanKeyOrder('board')
    )
  }
}

/** The answer as stored, always English: a translated option's text maps to the option itself. */
function canonicalAnswer(clarification: AeroTomlTable, answer: string): string {
  const wanted = trimLikeRust(answer).toLowerCase()
  const same = (option: string): boolean => trimLikeRust(option).toLowerCase() === wanted
  const options = readStrings(clarification, 'options')
  if (options.some(same)) {
    return answer
  }
  const translation = clarification.tr
  if (isAeroTomlTable(translation)) {
    const translated = readStrings(translation, 'options')
    const index = translated.length === options.length ? translated.findIndex(same) : -1
    if (index >= 0) {
      return options[index]
    }
  }
  return answer
}

/** kanban_card_answer: stores each answer on its still-open question and returns how many landed. */
export function answerAeroKanbanClarifications(
  document: AeroKanbanDocument,
  cardId: string,
  answers: readonly { id: string; answer: string }[],
  via: string,
  stamp: string
): number {
  const card = findAeroKanbanCard(document, cardId)
  if (card === undefined) {
    throw new AeroKanbanError(`card '${cardId}' not found`)
  }
  let stored = 0
  for (const { id, answer } of answers) {
    const text = capChars(answer, MAX_ANSWER_CHARS)
    const open = readTables(card, 'clarifications').find(
      (clarification) =>
        readString(clarification, 'id') === id &&
        trimLikeRust(readString(clarification, 'answer')) === ''
    )
    if (text === '' || open === undefined) {
      continue
    }
    const order = aeroKanbanKeyOrder('clarification')
    setKnownKey(open, 'answer', canonicalAnswer(open, text), order)
    setKnownKey(open, 'answered_at', stamp, order)
    setKnownKey(open, 'via', via, order)
    stored += 1
  }
  if (stored === 0) {
    throw new AeroKanbanError(
      'none of those questions is open any more (the card may have been triaged again)'
    )
  }
  return stored
}
