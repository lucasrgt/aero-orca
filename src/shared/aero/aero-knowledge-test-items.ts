import { renderAeroKnowledgeItem, type AeroItemRecord } from './aero-item-serializer'
import { buildAeroKnowledgeIndex } from './aero-knowledge-index'
import { parseAeroKnowledgeItem, type AeroKnowledgeItem } from './aero-knowledge-item'

export const TEST_NOW = new Date('2026-11-25T22:00:00Z')
const FRESH = '2026-11-20T00:00:00+00:00'

/** Builds an item through the same text the disk holds, so the parser derives its flags. */
export function makeAeroItem(fields: Partial<AeroItemRecord> & { id: string }): AeroKnowledgeItem {
  const record: AeroItemRecord = {
    slug: 'geral',
    type: 'fact',
    title: `Item ${fields.id}`,
    tags: [],
    provenance: 'observado',
    evidence: null,
    decay: 'stable',
    created: FRESH,
    updated: FRESH,
    validated: FRESH,
    links: [],
    body: 'plain body',
    ...fields
  }
  const parsed = parseAeroKnowledgeItem(
    renderAeroKnowledgeItem(record),
    `.aerofortress/items/${record.slug}/${record.id}.md`,
    TEST_NOW
  )
  if (!parsed.ok) {
    throw new Error(parsed.issues.join('; '))
  }
  return parsed.value
}

export function makeAeroIndex(items: AeroKnowledgeItem[]) {
  return buildAeroKnowledgeIndex(items)
}
