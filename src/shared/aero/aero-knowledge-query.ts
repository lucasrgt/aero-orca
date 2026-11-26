import { parseAeroQueryPhrases, searchAeroBm25 } from './aero-bm25-search'
import {
  aeroDecayDays,
  isAeroItemStale,
  isAeroRfc3339,
  normalizeAeroSlug,
  type AeroKnowledgeItem
} from './aero-knowledge-item'
import { countAeroLinks, type AeroKnowledgeIndex } from './aero-knowledge-index'

export type AeroQueryFilters = { q?: string; slug?: string; tag?: string; limit: number }

export type AeroQueryHit = {
  item: AeroKnowledgeItem
  score: number
  links: number
  replaced: boolean
}

const MS_PER_DAY = 86_400_000
const RRF_K = 60
const REPLACED_PENALTY = 0.45
const MAX_CANDIDATES = 200

function provenanceWeight(provenance: string): number {
  switch (provenance) {
    case 'dito':
      return 1
    case 'observado':
      return 0.95
    case 'importado':
      return 0.8
    default:
      return 0.7
  }
}

/** network.rs `freshness`: 1 down to 0.7 across the decay window, 0.55 once stale, 0.7 unreadable. */
function freshnessFactor(item: AeroKnowledgeItem, now: Date): number {
  const validatedAt = Date.parse(item.validated.replace(' ', 'T'))
  if (!isAeroRfc3339(item.validated) || Number.isNaN(validatedAt)) {
    return 0.7
  }
  if (isAeroItemStale(item.decay, item.validated, now)) {
    return 0.55
  }
  const ageDays = Math.trunc((now.getTime() - validatedAt) / MS_PER_DAY)
  return 1 - 0.3 * Math.max(ageDays / aeroDecayDays(item.decay), 0)
}

/** Provenance x freshness: the part of an item's score that does not depend on the query. */
export function aeroBaseScore(item: AeroKnowledgeItem, now: Date): number {
  return provenanceWeight(item.provenance) * freshnessFactor(item, now)
}

/** Hubs are structural: a gentle boost, at most about +15%. */
export function aeroCentralityBoost(degree: number): number {
  return 1 + 0.05 * Math.min(Math.log(1 + Math.max(degree, 0)), 3)
}

function reciprocalRank(position: number): number {
  return 1 / (RRF_K + position + 1)
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000
}

/** `LIKE` as network.rs writes it: ASCII case-insensitive, the slug itself or a cell below it. */
function inSlug(item: AeroKnowledgeItem, slug: string | null): boolean {
  if (slug === null) {
    return true
  }
  const own = item.slug.toLowerCase()
  const wanted = slug.toLowerCase()
  return own === wanted || own.startsWith(`${wanted}/`)
}

function hasTagLike(item: AeroKnowledgeItem, tag: string | undefined): boolean {
  return !tag || `, ${item.tags.join(', ')},`.toLowerCase().includes(tag.toLowerCase())
}

function candidatesByText(index: AeroKnowledgeIndex, q: string) {
  const phrases = parseAeroQueryPhrases(q)
  const all = searchAeroBm25(index.search, phrases, 'all')
  // Aero fills the gaps with a semantic axis; with no embeddings, an empty AND falls back to OR.
  return all.length > 0 ? all : searchAeroBm25(index.search, phrases, 'any')
}

function rankByText(
  index: AeroKnowledgeIndex,
  filters: AeroQueryFilters,
  slug: string | null,
  now: Date
): { hit: AeroQueryHit; fused: number }[] {
  const fetch = Math.min(Math.max(filters.limit, 1) * 3, MAX_CANDIDATES)
  const matches = candidatesByText(index, filters.q ?? '')
    .flatMap((match) => {
      const item = index.byId.get(match.id)
      return item && inSlug(item, slug) && hasTagLike(item, filters.tag) ? [{ match, item }] : []
    })
    .slice(0, fetch)
  const candidates = matches.map(({ match, item }) => {
    const degree = countAeroLinks(index, item.id)
    const replaced = index.replacedIds.has(item.id)
    return {
      item,
      degree,
      replaced,
      relevance: match.score / (match.score + 5),
      prior: aeroBaseScore(item, now) * aeroCentralityBoost(degree)
    }
  })
  const fused = candidates.map(() => 0)
  const byRelevance = candidates
    .map((_, i) => i)
    .sort((a, b) => candidates[b].relevance - candidates[a].relevance)
  const byPrior = candidates
    .map((_, i) => i)
    .sort((a, b) => candidates[b].prior - candidates[a].prior)
  byRelevance.forEach((candidate, position) => {
    if (candidates[candidate].relevance > 0) {
      fused[candidate] += reciprocalRank(position)
    }
  })
  byPrior.forEach((candidate, position) => {
    fused[candidate] += reciprocalRank(position)
  })
  return candidates.map((candidate, i) => ({
    hit: { item: candidate.item, score: 0, links: candidate.degree, replaced: candidate.replaced },
    fused: fused[i] * (candidate.replaced ? REPLACED_PENALTY : 1)
  }))
}

function rankByRecency(
  index: AeroKnowledgeIndex,
  filters: AeroQueryFilters,
  slug: string | null,
  now: Date
): { hit: AeroQueryHit; fused: number }[] {
  const fetch = Math.min(Math.max(filters.limit, 1) * 3, MAX_CANDIDATES)
  return index.items
    .filter((item) => inSlug(item, slug) && hasTagLike(item, filters.tag))
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0))
    .slice(0, fetch)
    .map((item) => {
      const degree = countAeroLinks(index, item.id)
      const replaced = index.replacedIds.has(item.id)
      const score =
        aeroBaseScore(item, now) * aeroCentralityBoost(degree) * (replaced ? REPLACED_PENALTY : 1)
      return { hit: { item, score: 0, links: degree, replaced }, fused: score }
    })
}

/**
 * network.rs `query_items`: bm25 relevance and the item's own quality (provenance, freshness,
 * centrality) fused by reciprocal rank; retired items sink. Without `q`, newest first by quality.
 * There is no usage heat here: this server keeps no state beyond the files.
 */
export function queryAeroKnowledge(
  index: AeroKnowledgeIndex,
  filters: AeroQueryFilters,
  now: Date
): AeroQueryHit[] {
  const slug = filters.slug === undefined ? null : normalizeAeroSlug(filters.slug)
  const text = filters.q?.trim()
  const ranked = text
    ? rankByText(index, { ...filters, q: text }, slug, now)
    : rankByRecency(index, filters, slug, now)
  return ranked
    .sort((a, b) => b.fused - a.fused)
    .slice(0, Math.max(filters.limit, 1))
    .map(({ hit, fused }) => ({ ...hit, score: roundScore(fused) }))
}
