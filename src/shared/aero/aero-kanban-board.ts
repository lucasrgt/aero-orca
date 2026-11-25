import { z } from 'zod'
import type { AeroParseResult } from './aero-parse-result'
import { parseAeroTomlDocument } from './aero-toml-document'
import { aeroF64, aeroU32, aeroU64 } from './aero-toml-integers'

// Every field mirrors kanban.rs: serde defaults for what is omitted, unknown keys tolerated (and
// dropped: TOML integers arrive as bigints, which must not leak into the snapshot through them).
const text = z.string().default('')
const flag = z.boolean().default(false)
// kanban.rs types every count as u32 (`pr_number` and `tokens` as u64): a decimal is a parse error.
// This strictness applies to the modeled fields only: unmodeled keys are dropped, whatever their type.
const count = aeroU32.default(0)
const textList = z.array(z.string()).default([])

const SubtaskSchema = z.object({ title: text, done: flag })

const AttachmentSchema = z.object({ name: text, path: text, kind: text, note: text })

const ReadinessSchema = z.object({
  verdict: text,
  score: count,
  checks: z.array(z.boolean()).default([]),
  missing_questions: textList,
  risk: text,
  estimate_min: count,
  triaged_at: text,
  text_hash: text,
  gate_approved_hash: text,
  // Written by newer Aero builds than the Rust this reader was derived from.
  split_into: textList
})

// oxlint-disable-next-line unicorn/no-thenable -- Why: Aero's acceptance criteria are Given/When/Then.
const SpecCriterionSchema = z.object({ given: text, when: text, then: text })

const CardSpecSchema = z.object({
  story: text,
  refined_at: text,
  text_hash: text,
  edited: flag,
  acceptance: z.array(SpecCriterionSchema).default([]),
  assumptions: textList
})

const ClarificationSchema = z.object({
  id: text,
  question: text,
  answer: text,
  asked_at: text,
  answered_at: text,
  // app | telegram | agent
  via: text
})

const TriageErrorSchema = z.object({
  error: text,
  at: text,
  text_hash: text,
  attempts: count,
  retry_after: text
})

const CriterionProofSchema = z.object({
  index: count,
  text,
  test_path: text,
  test_name: text,
  // proven | unproven
  status: text,
  reason: text
})

const MergeStateSchema = z.object({
  // pending | merged | stopped
  state: text,
  reason: text,
  pr_number: aeroU64.default(0),
  strategy: text,
  merge_commit: text,
  at: text
})

const DeployStateSchema = z.object({
  state: text,
  reason: text,
  command: text,
  output_tail: text,
  at: text
})

const EvaluationSchema = z.object({
  // merge | request_changes | discard
  action: text,
  at: text,
  via: text,
  comment: z.string().optional()
})

const OutcomeSchema = z.object({
  status: text,
  summary: text,
  pr: text,
  branch: text,
  criteria: z.object({ pass: count, fail: count }).prefault({}),
  evidence: textList,
  cost_usd: aeroF64.optional(),
  tokens: aeroU64.optional(),
  followups: textList,
  questions: textList,
  at: text,
  criteria_proof: z.array(CriterionProofSchema).default([]),
  fully_proven: flag,
  merge: MergeStateSchema.optional(),
  deploy: DeployStateSchema.optional(),
  evaluation: EvaluationSchema.optional(),
  verified_sha: text,
  base_sha: text
})

export const AeroKanbanColumnSchema = z.object({
  id: z.string(),
  title: text,
  pipeline: text
})

export const AeroKanbanCardSchema = z.object({
  id: z.string(),
  title: text,
  desc: text,
  // "" | low | medium | high | urgent
  priority: text,
  category: text,
  subtasks: z.array(SubtaskSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  knowledge: textList,
  pipeline: text,
  column: text,
  session: text,
  phase: text,
  blocked_by: textList,
  blocks: textList,
  touched: text,
  readiness: ReadinessSchema.optional(),
  outcome: OutcomeSchema.optional(),
  effort: text,
  spec: CardSpecSchema.optional(),
  clarifications: z.array(ClarificationSchema).default([]),
  readiness_error: TriageErrorSchema.optional(),
  suggested: flag,
  suggestion_reason: text,
  suggestion_source: text,
  suggestion_accepted_at: text,
  suggestion_via: text,
  split_from: text,
  split_hash: text
})

export type AeroKanbanCard = z.infer<typeof AeroKanbanCardSchema>
export type AeroKanbanColumn = z.infer<typeof AeroKanbanColumnSchema>

export type AeroKanbanBoard = {
  name: string
  // monolith | conveyor | flexible
  mode: string
  pipeline: string
  columns: AeroKanbanColumn[]
  cards: AeroKanbanCard[]
}

const AeroKanbanBoardFileSchema = z.object({
  name: text,
  mode: z.string().default('monolith'),
  pipeline: text,
  column: z.array(AeroKanbanColumnSchema).default([]),
  card: z.array(AeroKanbanCardSchema).default([])
})

const DEFAULT_COLUMNS: readonly [string, string][] = [
  ['backlog', 'Backlog'],
  ['doing', 'Doing'],
  ['review', 'Review'],
  ['done', 'Done'],
  ['blocked', 'Blocked']
]

/** kanban.rs `load_board_at`: a board without a name takes its file stem, one without columns gets the defaults. */
export function parseAeroKanbanBoard(
  raw: string,
  fileStem: string
): AeroParseResult<AeroKanbanBoard> {
  const parsed = parseAeroTomlDocument(raw, AeroKanbanBoardFileSchema)
  if (!parsed.ok) {
    return parsed
  }
  const file = parsed.value
  return {
    ok: true,
    value: {
      name: file.name || fileStem,
      mode: file.mode,
      pipeline: file.pipeline,
      columns:
        file.column.length > 0
          ? file.column
          : DEFAULT_COLUMNS.map(([id, title]) => ({ id, title, pipeline: '' })),
      cards: file.card
    }
  }
}
