import { buildAeroBm25Index, type AeroBm25Index } from './aero-bm25-search'
import { collectAeroReplacedIds, type AeroKnowledgeItem } from './aero-knowledge-item'
import {
  countAeroDegrees,
  deriveAeroRelations,
  type AeroRelation
} from './aero-knowledge-relations'

/** Everything a query needs, derived once from the parsed items (Aero's `index.db`, in memory). */
export type AeroKnowledgeIndex = {
  /** One item per id: the copy `byId` points at. */
  items: AeroKnowledgeItem[]
  byId: Map<string, AeroKnowledgeItem>
  /** Every path carrying an id, in path order; more than one means a duplicate left on disk. */
  pathsById: Map<string, string[]>
  relations: AeroRelation[]
  degrees: Map<string, number>
  replacedIds: Set<string>
  search: AeroBm25Index
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function updatedAt(item: AeroKnowledgeItem): number {
  const time = Date.parse(item.updated.replace(' ', 'T'))
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/** Of two files carrying one id: the newest `updated` wins, then the smaller path. */
function isPreferred(candidate: AeroKnowledgeItem, current: AeroKnowledgeItem): boolean {
  const difference = updatedAt(candidate) - updatedAt(current)
  if (difference !== 0 && !Number.isNaN(difference)) {
    return difference > 0
  }
  return comparePaths(candidate.path, current.path) < 0
}

export function buildAeroKnowledgeIndex(items: readonly AeroKnowledgeItem[]): AeroKnowledgeIndex {
  const sorted = [...items].sort((a, b) => comparePaths(a.path, b.path))
  const byId = new Map<string, AeroKnowledgeItem>()
  const pathsById = new Map<string, string[]>()
  for (const item of sorted) {
    pathsById.set(item.id, [...(pathsById.get(item.id) ?? []), item.path])
    const current = byId.get(item.id)
    if (!current || isPreferred(item, current)) {
      byId.set(item.id, item)
    }
  }
  const ordered = sorted.filter((item) => byId.get(item.id) === item)
  const relations = deriveAeroRelations(ordered)
  return {
    items: ordered,
    byId,
    pathsById,
    relations,
    degrees: countAeroDegrees(relations),
    replacedIds: collectAeroReplacedIds(ordered),
    search: buildAeroBm25Index(ordered)
  }
}

export function countAeroLinks(index: AeroKnowledgeIndex, id: string): number {
  return index.degrees.get(id) ?? 0
}
