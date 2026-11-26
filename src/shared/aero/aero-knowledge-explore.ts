import { aeroIdPrefix } from './aero-item-serializer'
import type { AeroKnowledgeIndex } from './aero-knowledge-index'
import { isAeroItemStale, type AeroKnowledgeItem } from './aero-knowledge-item'
import { aeroBaseScore, queryAeroKnowledge } from './aero-knowledge-query'
import type { AeroRelation } from './aero-knowledge-relations'

type Star = { item: AeroKnowledgeItem; score: number; replaced: boolean; stale: boolean }

const SEED_LIMIT = 6
const MAX_HOPS = 2
const MAX_STARS = 30
const REPLACED_PENALTY = 0.45
const FULL_BODY_STARS = 5
const SUMMARY_STARS = 13
const FULL_BODY_CHARS = 1800
const SUMMARY_CHARS = 280
const MAX_RELATION_LINES = 20

function hopWeight(kind: string): number {
  if (kind === 'replaces' || kind === 'duplicates') {
    return 0.85
  }
  return kind === 'depends_on' ? 0.7 : 0.6
}

/** Budget grows with the corpus, so a bigger network never gets a smaller answer. */
function budgetChars(totalItems: number, budgetTokens: number): number {
  if (budgetTokens > 0) {
    return Math.min(Math.max(budgetTokens * 4, 3200), 60_000)
  }
  if (totalItems < 80) {
    return 8000
  }
  return totalItems < 250 ? 12_000 : 16_000
}

function clip(text: string, maxChars: number): string {
  const chars = [...text.trim()]
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : chars.join('')
}

/** A breadth-first walk of the relations (undirected, two hops): the score decays per edge crossed. */
function walkNeighborhood(
  index: AeroKnowledgeIndex,
  seeds: { id: string; score: number }[]
): { best: Map<string, number>; walked: AeroRelation[] } {
  const touching = new Map<string, AeroRelation[]>()
  for (const relation of index.relations) {
    touching.set(relation.from, [...(touching.get(relation.from) ?? []), relation])
    if (relation.to !== relation.from) {
      touching.set(relation.to, [...(touching.get(relation.to) ?? []), relation])
    }
  }
  const best = new Map<string, number>()
  const walked: AeroRelation[] = []
  const queue: { id: string; score: number; depth: number }[] = []
  for (const seed of seeds) {
    best.set(seed.id, seed.score)
    queue.push({ ...seed, depth: 0 })
  }
  for (let head = 0; head < queue.length; head += 1) {
    const { id, score, depth } = queue[head]
    if (depth >= MAX_HOPS || best.size >= MAX_STARS) {
      continue
    }
    for (const relation of touching.get(id) ?? []) {
      const other = relation.from === id ? relation.to : relation.from
      walked.push(relation)
      const reached = score * hopWeight(relation.kind)
      if (reached > (best.get(other) ?? 0) && best.size < MAX_STARS) {
        best.set(other, reached)
        queue.push({ id: other, score: reached, depth: depth + 1 })
      }
    }
  }
  return { best, walked }
}

function collectStars(index: AeroKnowledgeIndex, best: Map<string, number>, now: Date): Star[] {
  const stars: Star[] = []
  for (const [id, arrival] of best) {
    const item = index.byId.get(id)
    if (!item) {
      continue
    }
    const replaced = index.replacedIds.has(id)
    const score =
      arrival * (0.5 + 0.5 * aeroBaseScore(item, now)) * (replaced ? REPLACED_PENALTY : 1)
    stars.push({
      item,
      score: Math.round(score * 1000) / 1000,
      replaced,
      stale: isAeroItemStale(item.decay, item.validated, now)
    })
  }
  return stars.sort((a, b) => b.score - a.score)
}

function describeEntry(star: Star, position: number): { skeleton: string; entry: string } {
  const { item } = star
  const id8 = aeroIdPrefix(item.id)
  const skeleton = `- [${item.type}] ${item.title} (${id8}${star.stale ? ' · VENCIDO' : ''})\n`
  if (position >= SUMMARY_STARS) {
    return { skeleton, entry: skeleton }
  }
  const body = clip(item.body, position < FULL_BODY_STARS ? FULL_BODY_CHARS : SUMMARY_CHARS)
  const flags = `${star.stale ? ' · VENCIDO' : ''}${star.replaced ? ' · substituído' : ''}`
  const header = `#### [${item.type} · ${item.provenance}${flags} · ★${star.score.toFixed(2)}] ${item.title} (${id8})`
  return { skeleton, entry: `${header}\n${body}\n\n` }
}

function relationLines(
  stars: readonly Star[],
  walked: readonly AeroRelation[],
  shown: ReadonlySet<string>
): string {
  const titles = new Map(stars.map((star) => [star.item.id, star.item.title]))
  const lines: string[] = []
  const seen = new Set<string>()
  let inferred = false
  for (const relation of walked) {
    const key = `${relation.from}\u0000${relation.to}\u0000${relation.kind}`
    if (!shown.has(relation.from) || !shown.has(relation.to) || seen.has(key)) {
      continue
    }
    seen.add(key)
    if (lines.length >= MAX_RELATION_LINES) {
      break
    }
    const isInferred = relation.origin === 'inferida'
    inferred ||= isInferred
    const name = (id: string): string => titles.get(id) ?? aeroIdPrefix(id)
    lines.push(
      `- ${name(relation.from)} —${relation.kind}→ ${name(relation.to)}${isInferred ? ' (inferida)' : ''}`
    )
  }
  if (lines.length === 0) {
    return ''
  }
  const note = inferred
    ? '(inferida = citação detectada no corpo; se a relação for real, consolide com link())\n'
    : ''
  return `## Relações\n${lines.join('\n')}\n${note}\n`
}

/**
 * network.rs `explore` with a query: the best matches plus their connected neighborhood, full
 * bodies at the center and one-line skeletons at the edge, inside a character budget.
 */
export function exploreAeroKnowledge(
  index: AeroKnowledgeIndex,
  q: string,
  budgetTokens: number,
  now: Date
): string {
  const seeds = queryAeroKnowledge(index, { q, limit: SEED_LIMIT }, now)
  if (seeds.length === 0) {
    return '(a constelação ainda não tem estrelas sobre isso — nada na rede para esses termos)'
  }
  const { best, walked } = walkNeighborhood(
    index,
    seeds.map((seed) => ({ id: seed.item.id, score: seed.score }))
  )
  const stars = collectStars(index, best, now)
  const limit = budgetChars(index.items.length, budgetTokens)
  const encoder = new TextEncoder()
  const size = (text: string): number => encoder.encode(text).length

  const stale = stars
    .slice(0, SUMMARY_STARS)
    .filter((star) => star.stale)
    .map((star) => `  - ${star.item.title} (${aeroIdPrefix(star.item.id)})`)
  let out = stale.length
    ? `⚠ items VENCIDOS abaixo — se o trabalho confirmar que ainda valem, validate(id):\n${stale.join('\n')}\n\n`
    : ''
  out += `## Constelação — "${q}" (${stars.length} estrelas de ${index.items.length} na rede)\n\n`

  const cells = [...new Set(stars.map((star) => star.item.slug))]
  const shown = new Set<string>()
  const dropped: string[] = []
  for (const cell of cells) {
    let section = `### ${cell}\n`
    let wrote = false
    for (const [position, star] of stars.entries()) {
      if (star.item.slug !== cell) {
        continue
      }
      const { skeleton, entry } = describeEntry(star, position)
      const id = star.item.id
      if (size(out) + size(section) + size(entry) > limit) {
        if (size(out) + size(section) + size(skeleton) <= limit) {
          section += skeleton
          shown.add(id)
          wrote = true
        } else {
          dropped.push(`- [${cell}] ${star.item.title} (${aeroIdPrefix(id)})`)
        }
        continue
      }
      section += entry
      shown.add(id)
      wrote = true
    }
    if (wrote) {
      out += `${section}\n`
    }
  }
  out += relationLines(stars, walked, shown)
  if (dropped.length > 0) {
    out += `## Fora do orçamento (${dropped.length} — read(id) se precisar)\n${dropped.join('\n')}\n`
  }
  return out.trimEnd()
}
