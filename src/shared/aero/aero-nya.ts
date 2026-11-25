import { z } from 'zod'
import { aeroFailure, type AeroParseResult } from './aero-parse-result'
import { parseAeroTomlDocument } from './aero-toml-document'
import { aeroU32, aeroU64 } from './aero-toml-integers'

// not-you-again derives deny_unknown_fields on scars and configs; `validate` adds the rules below.
const AeroNyaOccurrenceSchema = z.strictObject({
  occurred_at: z.string(),
  source: z.string().optional(),
  reported_by: z.string().optional(),
  corrected_by: z.string().optional(),
  recorded_by: z.string().optional(),
  recorded_for: z.string().optional(),
  commit: z.string().optional()
})

const AeroNyaScarSchema = z.strictObject({
  schema: aeroU32,
  id: z.string(),
  title: z.string(),
  lesson: z.string(),
  scope: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  occurrences: z.array(AeroNyaOccurrenceSchema)
})

export type AeroNyaScar = z.infer<typeof AeroNyaScarSchema>

const AeroNyaConfigSchema = z.strictObject({
  schema: aeroU32,
  check: z.strictObject({ timeout_seconds: aeroU64 })
})

// `config.local.toml` is the personal judge override.
const AeroNyaJudgeConfigSchema = z.strictObject({
  schema: aeroU32,
  judge: z.string(),
  command: z.array(z.string()).default([])
})

export type AeroNyaConfig = { schema: number; timeoutSeconds: number }
export type AeroNyaJudgeConfig = { judge: string; command: string[] }

function validateScar(scar: AeroNyaScar): string[] {
  const issues: string[] = []
  if (scar.schema !== 1) {
    issues.push(`unsupported schema ${scar.schema}`)
  }
  if (!scar.id.startsWith('NYA-') || scar.title.trim() === '' || scar.lesson.trim() === '') {
    issues.push('invalid scar: id must start with "NYA-" and title and lesson must not be blank')
  }
  if (scar.scope.length === 0) {
    issues.push('has no scope; add a specific glob or "**" for an explicitly global scar')
  }
  if (scar.occurrences.length === 0) {
    issues.push('has no occurrences')
  }
  const actors = scar.occurrences.flatMap((occurrence) => [
    occurrence.reported_by,
    occurrence.corrected_by,
    occurrence.recorded_by,
    occurrence.recorded_for
  ])
  for (const actor of actors) {
    if (actor !== undefined && !actor.includes(':')) {
      issues.push(`actor must be namespaced: ${actor}`)
    }
  }
  return issues
}

export function parseAeroNyaScar(raw: string): AeroParseResult<AeroNyaScar> {
  const parsed = parseAeroTomlDocument(raw, AeroNyaScarSchema)
  if (!parsed.ok) {
    return parsed
  }
  const issues = validateScar(parsed.value)
  return issues.length === 0 ? parsed : aeroFailure(...issues)
}

export function parseAeroNyaConfig(raw: string): AeroParseResult<AeroNyaConfig> {
  const parsed = parseAeroTomlDocument(raw, AeroNyaConfigSchema)
  return parsed.ok
    ? {
        ok: true,
        value: { schema: parsed.value.schema, timeoutSeconds: parsed.value.check.timeout_seconds }
      }
    : parsed
}

export function parseAeroNyaJudgeConfig(raw: string): AeroParseResult<AeroNyaJudgeConfig> {
  const parsed = parseAeroTomlDocument(raw, AeroNyaJudgeConfigSchema)
  return parsed.ok
    ? { ok: true, value: { judge: parsed.value.judge, command: parsed.value.command } }
    : parsed
}
