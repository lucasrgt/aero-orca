import type { AeroKnowledgeIndex } from './aero-knowledge-index'
import { AERO_CONSTITUTION_TAG, AERO_DIGEST_TAG, isAeroItemStale } from './aero-knowledge-item'
import { queryAeroKnowledge, type AeroQueryHit } from './aero-knowledge-query'

const MIN_BUDGET_TOKENS = 200
const CHARS_PER_TOKEN = 4
const MAX_BODY_CHARS = 1200
const SLUG_FETCH_LIMIT = 40
const UNFILTERED_FETCH_LIMIT = 80
const CONSTITUTION_LIMIT = 4

function hitsForSlugs(
  index: AeroKnowledgeIndex,
  slugs: readonly string[] | undefined,
  now: Date
): AeroQueryHit[] {
  if (!slugs || slugs.length === 0) {
    return queryAeroKnowledge(index, { limit: UNFILTERED_FETCH_LIMIT }, now)
  }
  return slugs
    .flatMap((slug) => queryAeroKnowledge(index, { slug, limit: SLUG_FETCH_LIMIT }, now))
    .sort((a, b) => b.score - a.score)
}

function clipBody(body: string): string {
  const chars = [...body.trim()]
  return chars.length > MAX_BODY_CHARS
    ? `${chars.slice(0, MAX_BODY_CHARS).join('')}…`
    : chars.join('')
}

/**
 * network.rs `pack`: the layered context pyramid. The constitution always comes first, then the
 * cell digests, then the best-scored items, cut at the budget (bytes, like Aero's string length).
 */
export function packAeroKnowledge(
  index: AeroKnowledgeIndex,
  slugs: readonly string[] | undefined,
  budgetTokens: number,
  now: Date
): string {
  const budgetChars = Math.max(budgetTokens, MIN_BUDGET_TOKENS) * CHARS_PER_TOKEN
  const seen = new Set<string>()
  const ordered: AeroQueryHit[] = []
  const take = (hit: AeroQueryHit): void => {
    if (!seen.has(hit.item.id)) {
      seen.add(hit.item.id)
      ordered.push(hit)
    }
  }
  queryAeroKnowledge(index, { tag: AERO_CONSTITUTION_TAG, limit: CONSTITUTION_LIMIT }, now).forEach(
    take
  )
  const hits = hitsForSlugs(index, slugs, now)
  const isDigest = (hit: AeroQueryHit): boolean => hit.item.tags.includes(AERO_DIGEST_TAG)
  hits.filter(isDigest).forEach(take)
  hits.filter((hit) => !isDigest(hit)).forEach(take)

  const encoder = new TextEncoder()
  let out = ''
  let used = 0
  let shown = 0
  for (const { item } of ordered) {
    const stale = isAeroItemStale(item.decay, item.validated, now) ? ' · VENCIDO' : ''
    const entry = `### [${item.slug} · ${item.type} · ${item.provenance}${stale}] ${item.title}\n${clipBody(item.body)}\n\n`
    const size = encoder.encode(entry).length
    if (used + size > budgetChars) {
      break
    }
    used += size
    shown += 1
    out += entry
  }
  if (shown < ordered.length) {
    out += `(+${ordered.length - shown} items fora do ambiente — query/explore puxa sob demanda)\n`
  }
  return out.trim()
}
