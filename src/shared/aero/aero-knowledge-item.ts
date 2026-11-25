import { z } from 'zod'
import {
  readAeroFrontmatterFields,
  splitAeroCommaList,
  splitAeroFrontmatter
} from './aero-frontmatter'
import { aeroFailure, describeZodIssues, type AeroParseResult } from './aero-parse-result'

export const AERO_ITEM_TYPES = ['fact', 'decision', 'rule', 'doc', 'prompt', 'contract'] as const
export const AERO_PROVENANCES = ['dito', 'observado', 'inferido', 'importado'] as const
export const AERO_DECAYS = ['volatile', 'seasonal', 'stable'] as const
export const AERO_DIGEST_TAG = 'digesto'
export const AERO_CONSTITUTION_TAG = 'constituicao'

const AERO_DECAY_DAYS: Record<string, number> = { volatile: 30, seasonal: 180 }
const AERO_DEFAULT_DECAY_DAYS = 730
const MS_PER_DAY = 86_400_000
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

export const AeroKnowledgeItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(AERO_ITEM_TYPES),
  title: z.string().min(1),
  tags: z.array(z.string()),
  // Kept as written: Aero only warns about unknown values and scores them as unknown.
  provenance: z.string(),
  evidence: z.string().nullable(),
  decay: z.string(),
  created: z.string(),
  updated: z.string(),
  validated: z.string(),
  links: z.array(z.object({ kind: z.string(), to: z.string() })),
  body: z.string(),
  path: z.string(),
  isDigest: z.boolean(),
  isConstitution: z.boolean(),
  stale: z.boolean(),
  /** Retired truth: some item's `replaces` link points at it. Set by the reader, never by the parser. */
  replaced: z.boolean()
})

export type AeroKnowledgeItem = z.infer<typeof AeroKnowledgeItemSchema>

/** network.rs `norm_slug`. */
export function normalizeAeroSlug(raw: string): string {
  const slug = [...raw.trim().toLowerCase()]
    .map((char) => (/[\p{L}\p{N}/_-]/u.test(char) ? char : '-'))
    .join('')
    .replace(/^[-/]+|[-/]+$/g, '')
  return slug.length > 0 ? slug : 'geral'
}

/** network.rs `normalize_type`: an unknown type is demoted to `fact`. */
export function normalizeAeroItemType(raw: string): (typeof AERO_ITEM_TYPES)[number] {
  const type = raw.trim().toLowerCase()
  return AERO_ITEM_TYPES.find((known) => known === type) ?? 'fact'
}

/** network.rs `freshness`: an unreadable `validated` date or an age past the decay window is stale. */
export function isAeroItemStale(decay: string, validated: string, now: Date): boolean {
  if (!RFC3339.test(validated)) {
    return true
  }
  const validatedAt = Date.parse(validated.replace(' ', 'T'))
  if (Number.isNaN(validatedAt)) {
    return true
  }
  const ageDays = Math.trunc((now.getTime() - validatedAt) / MS_PER_DAY)
  return ageDays > (AERO_DECAY_DAYS[decay] ?? AERO_DEFAULT_DECAY_DAYS)
}

function parseAeroItemLinks(value: string): { kind: string; to: string }[] {
  const links: { kind: string; to: string }[] = []
  for (const part of value.split(',')) {
    const entry = part.trim()
    const colon = entry.indexOf(':')
    if (colon !== -1) {
      links.push({ kind: entry.slice(0, colon).trim(), to: entry.slice(colon + 1).trim() })
    }
  }
  return links
}

export function parseAeroKnowledgeItem(
  raw: string,
  path: string,
  now: Date
): AeroParseResult<AeroKnowledgeItem> {
  const split = splitAeroFrontmatter(raw)
  if (!split) {
    return aeroFailure('missing "---" frontmatter block')
  }
  const fields = readAeroFrontmatterFields(split.header)
  const tags = splitAeroCommaList(fields.get('tags') ?? '')
  const created = fields.get('created') || now.toISOString()
  const updated = fields.get('updated') || created
  const validated = fields.get('validated') || updated
  const decay = fields.get('decay') ?? 'stable'
  const title = fields.get('title') ?? ''
  const parsed = AeroKnowledgeItemSchema.safeParse({
    id: fields.get('id') ?? '',
    slug: normalizeAeroSlug(fields.get('slug') ?? 'geral'),
    type: normalizeAeroItemType(fields.get('type') ?? 'fact'),
    title,
    tags,
    provenance: fields.get('provenance') ?? 'importado',
    evidence: fields.get('evidence') || null,
    decay,
    created,
    updated,
    validated,
    links: parseAeroItemLinks(fields.get('links') ?? ''),
    body: split.body,
    path,
    isDigest: tags.includes(AERO_DIGEST_TAG),
    isConstitution: tags.includes(AERO_CONSTITUTION_TAG),
    stale: isAeroItemStale(decay, validated, now),
    replaced: false
  })
  return parsed.success
    ? { ok: true, value: parsed.data }
    : aeroFailure(...describeZodIssues(parsed.error))
}

/** network.rs `retired`: every id that some item's `replaces` link points to; the truth it superseded. */
export function collectAeroReplacedIds(items: readonly AeroKnowledgeItem[]): Set<string> {
  return new Set(
    items.flatMap((item) => item.links.filter((link) => link.kind === 'replaces').map((l) => l.to))
  )
}
