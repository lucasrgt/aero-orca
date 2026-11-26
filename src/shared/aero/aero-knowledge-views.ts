import { countAeroLinks, type AeroKnowledgeIndex } from './aero-knowledge-index'
import { isAeroItemStale, type AeroKnowledgeItem } from './aero-knowledge-item'
import { aeroBaseScore, aeroCentralityBoost, type AeroQueryHit } from './aero-knowledge-query'

const SNIPPET_CHARS = 180
const MAX_NEIGHBORS = 12

type AeroNeighbor = { kind: string; origin: string; id: string; title: string; slug: string }

/** The compact row `query` prints: metadata and a snippet; `read` has the whole item. */
export function compactAeroQueryHit(hit: AeroQueryHit, now: Date): Record<string, unknown> {
  const { item } = hit
  return {
    id: item.id,
    slug: item.slug,
    type: item.type,
    title: item.title,
    provenance: item.provenance,
    stale: isAeroItemStale(item.decay, item.validated, now),
    score: hit.score,
    snippet: [...item.body].slice(0, SNIPPET_CHARS).join(''),
    ...(hit.links > 0 ? { links: hit.links } : {}),
    ...(hit.replaced ? { replaced: true } : {})
  }
}

function neighborsOf(index: AeroKnowledgeIndex, id: string, outgoing: boolean): AeroNeighbor[] {
  const neighbors: AeroNeighbor[] = []
  for (const relation of index.relations) {
    if ((outgoing ? relation.from : relation.to) !== id) {
      continue
    }
    const other: AeroKnowledgeItem | undefined = index.byId.get(
      outgoing ? relation.to : relation.from
    )
    if (other) {
      neighbors.push({
        kind: relation.kind,
        origin: relation.origin,
        id: other.id,
        title: other.title,
        slug: other.slug
      })
    }
    if (neighbors.length === MAX_NEIGHBORS) {
      break
    }
  }
  return neighbors
}

/** network.rs `read_item`: the full item with its graph neighborhood, or null when the id is unknown. */
export function readAeroKnowledgeItem(
  index: AeroKnowledgeIndex,
  id: string,
  now: Date
): Record<string, unknown> | null {
  const item = index.byId.get(id)
  if (!item) {
    return null
  }
  const degree = countAeroLinks(index, id)
  const linksOut = neighborsOf(index, id, true)
  const linksIn = neighborsOf(index, id, false)
  const score = aeroBaseScore(item, now) * aeroCentralityBoost(degree)
  return {
    id: item.id,
    slug: item.slug,
    type: item.type,
    title: item.title,
    body: item.body,
    tags: item.tags,
    provenance: item.provenance,
    evidence: item.evidence,
    decay: item.decay,
    createdAt: item.created,
    updatedAt: item.updated,
    lastValidated: item.validated,
    stale: isAeroItemStale(item.decay, item.validated, now),
    score: Math.round(score * 1000) / 1000,
    ...(degree > 0 ? { links: degree } : {}),
    ...(linksOut.length > 0 ? { links_out: linksOut } : {}),
    ...(linksIn.length > 0 ? { links_in: linksIn } : {})
  }
}
