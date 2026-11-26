import { z } from 'zod'
import { describeZodIssues } from './aero-parse-result'
import { AeroKanbanError } from './aero-kanban-tables'
import { aeroTomlToJson } from './aero-kanban-view'
import { trimLikeRust } from './aero-kanban-text-hash'
import { isAeroTomlTable, type AeroTomlTable } from './aero-toml-document-writer'

// kanban.rs `Outcome`, as an agent sends it (JSON): every field defaults, a wrong type is refused.
const text = z.string().default('')
const u32 = z.number().int().min(0).max(4_294_967_295).default(0)
const u64Value = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const u64 = u64Value.default(0)
const textList = z.array(z.string()).default([])

const CriterionProofSchema = z.object({
  index: u32,
  text,
  test_path: text,
  test_name: text,
  status: text,
  reason: text
})
const MergeSchema = z.object({
  state: text,
  reason: text,
  pr_number: u64,
  strategy: text,
  merge_commit: text,
  at: text
})
const DeploySchema = z.object({
  state: text,
  reason: text,
  command: text,
  output_tail: text,
  at: text
})
const EvaluationSchema = z.object({
  action: text,
  at: text,
  via: text,
  comment: z.string().nullish()
})

const OutcomeSchema = z.object({
  status: text,
  summary: text,
  pr: text,
  branch: text,
  criteria: z.object({ pass: u32, fail: u32 }).prefault({}),
  evidence: textList,
  cost_usd: z.number().nullish(),
  // zod fills a default even under nullish, and an absent Option must stay absent
  tokens: u64Value.nullish(),
  followups: textList,
  questions: textList,
  at: text,
  criteria_proof: z.array(CriterionProofSchema).default([]),
  fully_proven: z.boolean().default(false),
  merge: MergeSchema.nullish(),
  deploy: DeploySchema.nullish(),
  evaluation: EvaluationSchema.nullish(),
  verified_sha: text,
  base_sha: text
})

type ParsedOutcome = z.infer<typeof OutcomeSchema>
/** The outcome with every Option as undefined when absent (JSON null and a missing key are the same). */
export type AeroOutcome = Omit<
  ParsedOutcome,
  'cost_usd' | 'tokens' | 'merge' | 'deploy' | 'evaluation'
> & {
  cost_usd?: number
  tokens?: number
  merge?: z.infer<typeof MergeSchema>
  deploy?: z.infer<typeof DeploySchema>
  evaluation?: { action: string; at: string; via: string; comment?: string }
}

function settle(parsed: ParsedOutcome): AeroOutcome {
  return {
    ...parsed,
    cost_usd: parsed.cost_usd ?? undefined,
    tokens: parsed.tokens ?? undefined,
    merge: parsed.merge ?? undefined,
    deploy: parsed.deploy ?? undefined,
    evaluation: parsed.evaluation
      ? { ...parsed.evaluation, comment: parsed.evaluation.comment ?? undefined }
      : undefined
  }
}

const HARNESS_FIELDS = [
  'verified_sha',
  'base_sha',
  'criteria_proof',
  'fully_proven',
  'merge',
  'deploy',
  'evaluation'
] as const

/** An agent's `outcome` argument: refused when malformed or without a status. */
export function parseAeroAgentOutcome(value: unknown): AeroOutcome {
  const parsed = OutcomeSchema.safeParse(value)
  if (!parsed.success) {
    throw new AeroKanbanError(`outcome is malformed: ${describeZodIssues(parsed.error).join('; ')}`)
  }
  if (trimLikeRust(parsed.data.status) === '') {
    throw new AeroKanbanError('outcome.status is required')
  }
  return settle(parsed.data)
}

/** The outcome a card stores, read through the same schema; undefined when it has none. */
export function readStoredAeroOutcome(card: AeroTomlTable): AeroOutcome | undefined {
  const stored = card.outcome
  if (!isAeroTomlTable(stored)) {
    return undefined
  }
  const parsed = OutcomeSchema.safeParse(aeroTomlToJson(stored))
  return parsed.success ? settle(parsed.data) : undefined
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry
  )
}

function hasHarnessRecord(outcome: AeroOutcome): boolean {
  return (
    outcome.verified_sha !== '' ||
    outcome.fully_proven ||
    outcome.criteria_proof.length > 0 ||
    Boolean(outcome.merge) ||
    Boolean(outcome.deploy) ||
    Boolean(outcome.evaluation)
  )
}

/**
 * kanban.rs `outcome_from_agent`: the runner, the merge executor and the human's evaluation own
 * `verified_sha`, `base_sha`, `criteria_proof`, `fully_proven`, `merge`, `deploy` and `evaluation`.
 * An agent may omit them or echo the stored value, never change one; clearing an outcome that
 * carries them is refused. Returns what to store (null clears).
 */
export function aeroOutcomeFromAgent(
  stored: AeroOutcome | undefined,
  incoming: AeroOutcome | null
): AeroOutcome | null {
  if (incoming === null) {
    if (stored !== undefined && hasHarnessRecord(stored)) {
      throw new AeroKanbanError(
        "this outcome carries the harness's own record (the verified commit, the proof, the merge or the evaluation), so it cannot be cleared from here"
      )
    }
    return null
  }
  const blank = settle(OutcomeSchema.parse({ status: '' }))
  const kept = stored ?? blank
  const result = { ...incoming }
  const forged: string[] = []
  for (const field of HARNESS_FIELDS) {
    const sent = stable(incoming[field])
    if (sent !== stable(blank[field]) && sent !== stable(kept[field])) {
      forged.push(field)
    }
    Object.assign(result, { [field]: kept[field] })
  }
  if (forged.length > 0) {
    const many = forged.length > 1
    throw new AeroKanbanError(
      `outcome.${forged.join(', outcome.')} ${many ? 'are' : 'is'} written by the harness only (the runner, the merge executor and your evaluation); leave ${many ? 'them' : 'it'} out`
    )
  }
  return result
}

function counts(source: Record<string, number>): AeroTomlTable {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, BigInt(value)]))
}

/** A nested outcome table: strings as they are, counts as TOML integers, absent Options left out. */
function scalarTable(source: Record<string, string | number | null | undefined>): AeroTomlTable {
  const table: AeroTomlTable = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      table[key] = value
    } else if (typeof value === 'number') {
      table[key] = BigInt(value)
    }
  }
  return table
}

/**
 * The outcome as a table, in struct order with the skipped fields left out; `at` is stamped when
 * empty.
 */
export function aeroOutcomeToTable(outcome: AeroOutcome, now: string): AeroTomlTable {
  const table: AeroTomlTable = {
    status: outcome.status,
    summary: outcome.summary,
    pr: outcome.pr,
    branch: outcome.branch,
    criteria: counts(outcome.criteria),
    evidence: outcome.evidence
  }
  if (outcome.cost_usd !== null && outcome.cost_usd !== undefined) {
    table.cost_usd = outcome.cost_usd
  }
  if (outcome.tokens !== null && outcome.tokens !== undefined) {
    table.tokens = BigInt(outcome.tokens)
  }
  table.followups = outcome.followups
  table.questions = outcome.questions
  table.at = outcome.at === '' ? now : outcome.at
  if (outcome.criteria_proof.length > 0) {
    table.criteria_proof = outcome.criteria_proof.map((proof) => ({
      ...proof,
      index: BigInt(proof.index)
    }))
  }
  table.fully_proven = outcome.fully_proven
  if (outcome.merge) {
    table.merge = scalarTable(outcome.merge)
  }
  if (outcome.deploy) {
    table.deploy = scalarTable(outcome.deploy)
  }
  if (outcome.evaluation) {
    table.evaluation = scalarTable(outcome.evaluation)
  }
  for (const key of ['verified_sha', 'base_sha'] as const) {
    if (outcome[key] !== '') {
      table[key] = outcome[key]
    }
  }
  return table
}
