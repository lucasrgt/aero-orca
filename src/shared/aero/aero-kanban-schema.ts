// The tables of a board file as kanban.rs declares them, in struct order. The order is what a new
// key is placed by; the kind and omission rule are what the JSON view fills and drops by.

/** s string, b bool, n integer, f float, S string list, B bool list, t:<table>, T:<table> list. */
type FieldKind = 's' | 'b' | 'n' | 'f' | 'S' | 'B' | `t:${string}` | `T:${string}`
/** `empty`: skipped while ''/false/[]; `absent`: an Option, skipped while the key is missing. */
type FieldOmission = 'empty' | 'absent'
export type AeroKanbanField = readonly [key: string, kind: FieldKind, omit?: FieldOmission]

export const AERO_KANBAN_TABLES: Record<string, readonly AeroKanbanField[]> = {
  board: [
    ['name', 's'],
    ['mode', 's'],
    ['pipeline', 's'],
    ['column', 'T:column'],
    ['card', 'T:card']
  ],
  column: [
    ['id', 's'],
    ['title', 's'],
    ['pipeline', 's']
  ],
  card: [
    ['id', 's'],
    ['title', 's'],
    ['desc', 's'],
    ['priority', 's'],
    ['category', 's'],
    ['subtasks', 'T:subtask'],
    ['attachments', 'T:attachment'],
    ['knowledge', 'S'],
    ['pipeline', 's'],
    ['column', 's'],
    ['session', 's'],
    ['phase', 's'],
    ['blocked_by', 'S'],
    ['blocks', 'S'],
    ['touched', 's'],
    ['readiness', 't:readiness', 'absent'],
    ['outcome', 't:outcome', 'absent'],
    ['effort', 's', 'empty'],
    ['spec', 't:spec', 'absent'],
    ['clarifications', 'T:clarification', 'empty'],
    ['readiness_error', 't:triage_error', 'absent'],
    ['suggested', 'b', 'empty'],
    ['suggestion_reason', 's', 'empty'],
    ['suggestion_source', 's', 'empty'],
    ['suggestion_accepted_at', 's', 'empty'],
    ['suggestion_via', 's', 'empty'],
    ['split_from', 's', 'empty'],
    ['split_hash', 's', 'empty']
  ],
  subtask: [
    ['title', 's'],
    ['done', 'b']
  ],
  attachment: [
    ['name', 's'],
    ['path', 's'],
    ['kind', 's'],
    ['note', 's']
  ],
  readiness: [
    ['verdict', 's'],
    ['score', 'n'],
    ['checks', 'B'],
    ['missing_questions', 'S'],
    ['risk', 's'],
    ['estimate_min', 'n'],
    ['triaged_at', 's'],
    ['text_hash', 's'],
    ['stale', 'b', 'empty'],
    ['gate_approved_hash', 's', 'empty'],
    ['gate_approved', 'b', 'empty'],
    ['split_into', 'S', 'empty']
  ],
  spec: [
    ['story', 's'],
    ['refined_at', 's'],
    ['text_hash', 's'],
    ['edited', 'b', 'empty'],
    ['assumptions', 'S', 'empty'],
    ['assumptions_tr', 't:assumptions_tr', 'absent'],
    ['acceptance', 'T:criterion']
  ],
  criterion: [
    ['given', 's'],
    ['when', 's'],
    ['then', 's']
  ],
  assumptions_tr: [
    ['lang', 's'],
    ['items', 'S']
  ],
  clarification: [
    ['id', 's'],
    ['question', 's'],
    ['answer', 's'],
    ['asked_at', 's'],
    ['answered_at', 's'],
    ['via', 's'],
    ['options', 'S', 'empty'],
    ['recommended', 'n', 'absent'],
    ['tr', 't:clarification_tr', 'absent']
  ],
  clarification_tr: [
    ['lang', 's'],
    ['question', 's'],
    ['options', 'S']
  ],
  triage_error: [
    ['error', 's'],
    ['at', 's'],
    ['text_hash', 's'],
    ['attempts', 'n'],
    ['retry_after', 's']
  ],
  outcome: [
    ['status', 's'],
    ['summary', 's'],
    ['pr', 's'],
    ['branch', 's'],
    ['criteria', 't:criteria'],
    ['evidence', 'S'],
    ['cost_usd', 'f', 'absent'],
    ['tokens', 'n', 'absent'],
    ['followups', 'S'],
    ['questions', 'S'],
    ['at', 's'],
    ['criteria_proof', 'T:criterion_proof', 'empty'],
    ['fully_proven', 'b'],
    ['merge', 't:merge', 'absent'],
    ['deploy', 't:deploy', 'absent'],
    ['evaluation', 't:evaluation', 'absent'],
    ['verified_sha', 's', 'empty'],
    ['base_sha', 's', 'empty']
  ],
  criteria: [
    ['pass', 'n'],
    ['fail', 'n']
  ],
  criterion_proof: [
    ['index', 'n'],
    ['text', 's'],
    ['test_path', 's'],
    ['test_name', 's'],
    ['status', 's'],
    ['reason', 's']
  ],
  merge: [
    ['state', 's'],
    ['reason', 's'],
    ['pr_number', 'n'],
    ['strategy', 's'],
    ['merge_commit', 's'],
    ['at', 's']
  ],
  deploy: [
    ['state', 's'],
    ['reason', 's'],
    ['command', 's'],
    ['output_tail', 's'],
    ['at', 's']
  ],
  evaluation: [
    ['action', 's'],
    ['at', 's'],
    ['via', 's'],
    ['comment', 's', 'absent']
  ]
}

/** The keys of a table in struct order, for placing a key that is not in the file yet. */
export function aeroKanbanKeyOrder(table: string): string[] {
  return (AERO_KANBAN_TABLES[table] ?? []).map(([key]) => key)
}
