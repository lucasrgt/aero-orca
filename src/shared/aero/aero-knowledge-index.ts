import { buildAeroBm25Index, type AeroBm25Index } from './aero-bm25-search'
import { collectAeroReplacedIds, type AeroKnowledgeItem } from './aero-knowledge-item'
import {
  countAeroDegrees,
  deriveAeroRelations,
  type AeroRelation
} from './aero-knowledge-relations'

/** Everything a query needs, derived once from the parsed items (Aero's `index.db`, in memory). */
export type AeroKnowledgeIndex = {
  items: AeroKnowledgeItem[]
  byId: Map<string, AeroKnowledgeItem>
  relations: AeroRelation[]
  degrees: Map<string, number>
  replacedIds: Set<string>
  search: AeroBm25Index
}

export function buildAeroKnowledgeIndex(items: readonly AeroKnowledgeItem[]): AeroKnowledgeIndex {
  const ordered = [...items].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const relations = deriveAeroRelations(ordered)
  return {
    items: ordered,
    byId: new Map(ordered.map((item) => [item.id, item])),
    relations,
    degrees: countAeroDegrees(relations),
    replacedIds: collectAeroReplacedIds(ordered),
    search: buildAeroBm25Index(ordered)
  }
}

export function countAeroLinks(index: AeroKnowledgeIndex, id: string): number {
  return index.degrees.get(id) ?? 0
}
