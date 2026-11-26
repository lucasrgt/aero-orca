import type { AeroNyaScar } from './aero-nya'
import { renderTomlString, renderTomlStringArray } from './aero-toml-string-writer'

type AeroNyaOccurrence = AeroNyaScar['occurrences'][number]

const OCCURRENCE_FIELDS = [
  'occurred_at',
  'source',
  'reported_by',
  'corrected_by',
  'recorded_by',
  'recorded_for',
  'commit'
] as const

function renderOccurrence(occurrence: AeroNyaOccurrence): string {
  const lines = OCCURRENCE_FIELDS.flatMap((field) => {
    const value = occurrence[field]
    return value === undefined ? [] : [`${field} = ${renderTomlString(value)}\n`]
  })
  return `\n[[occurrences]]\n${lines.join('')}`
}

/** A scar file byte for byte as not-you-again writes it (`toml::to_string_pretty` of its `Scar`). */
export function renderAeroNyaScarToml(scar: AeroNyaScar): string {
  const head = [
    `schema = ${scar.schema}\n`,
    `id = ${renderTomlString(scar.id)}\n`,
    `title = ${renderTomlString(scar.title)}\n`,
    `lesson = ${renderTomlString(scar.lesson)}\n`,
    `scope = ${renderTomlStringArray(scar.scope)}\n`,
    `tags = ${renderTomlStringArray(scar.tags)}\n`,
    `created_at = ${renderTomlString(scar.created_at)}\n`
  ]
  return head.join('') + scar.occurrences.map(renderOccurrence).join('')
}

/** The scar as serde_json writes it: declaration order, and `null` for an occurrence field not set. */
export function aeroNyaScarToJson(scar: AeroNyaScar): Record<string, unknown> {
  return {
    schema: scar.schema,
    id: scar.id,
    title: scar.title,
    lesson: scar.lesson,
    scope: scar.scope,
    tags: scar.tags,
    created_at: scar.created_at,
    occurrences: scar.occurrences.map((occurrence) =>
      Object.fromEntries(OCCURRENCE_FIELDS.map((field) => [field, occurrence[field] ?? null]))
    )
  }
}
