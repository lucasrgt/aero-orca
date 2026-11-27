import type { AeroKanbanCardEdit } from '../../shared/aero/aero-kanban-card-ops'
import { parseAeroAgentOutcome } from '../../shared/aero/aero-kanban-outcome'
import { AeroKanbanError } from '../../shared/aero/aero-kanban-tables'

export type AeroKanbanToolArgs = Record<string, unknown>

/** serde's `as_str`: only a JSON string counts, anything else reads as omitted. */
export function optionalString(args: AeroKanbanToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

export function requiredString(args: AeroKanbanToolArgs, key: string): string {
  const value = optionalString(args, key)
  if (value === undefined) {
    throw new AeroKanbanError(`${key} is required`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The board name; one with nothing in it would silently become the `card` board, so it is refused. */
export function requiredBoardName(args: AeroKanbanToolArgs): string {
  const name = requiredString(args, 'board')
  if (name.trim() === '') {
    throw new AeroKanbanError('board is required')
  }
  return name
}

/** `kanban_card_update`'s arguments: what to change, validated before anything is written. */
export function cardEditFromArguments(args: AeroKanbanToolArgs): AeroKanbanCardEdit {
  const edit: AeroKanbanCardEdit = {}
  // readiness may only be cleared: it is the dispatcher's trust anchor, so a caller never asserts one
  if (Object.hasOwn(args, 'readiness')) {
    if (args.readiness !== null) {
      throw new AeroKanbanError(
        'readiness is set by kanban_card_triage; kanban_card_update can only clear it (readiness: null)'
      )
    }
    edit.clearReadiness = true
  }
  if (Object.hasOwn(args, 'outcome')) {
    edit.outcome = args.outcome === null ? null : parseAeroAgentOutcome(args.outcome)
  }
  for (const key of ['title', 'desc', 'pipeline', 'priority', 'category'] as const) {
    edit[key] = optionalString(args, key)
  }
  if (Array.isArray(args.subtasks)) {
    edit.subtasks = args.subtasks.map((subtask: unknown) => ({
      title: isRecord(subtask) && typeof subtask.title === 'string' ? subtask.title : '',
      done: isRecord(subtask) && subtask.done === true
    }))
  }
  if (Array.isArray(args.knowledge)) {
    edit.knowledge = args.knowledge.filter((id): id is string => typeof id === 'string')
  }
  return edit
}

/** `kanban_card_answer`'s answers: an entry without a string id and answer is dropped. */
export function answersFromArguments(args: AeroKanbanToolArgs): { id: string; answer: string }[] {
  if (!Array.isArray(args.answers)) {
    throw new AeroKanbanError('answers is required')
  }
  return args.answers.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.id === 'string' && typeof entry.answer === 'string'
      ? [{ id: entry.id, answer: entry.answer }]
      : []
  )
}
