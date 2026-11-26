import { describe, expect, it } from 'vitest'
import { buildAeroKnowledgeIndex } from './aero-knowledge-index'
import { makeAeroItem } from './aero-knowledge-test-items'

describe('buildAeroKnowledgeIndex duplicates', () => {
  const same = { id: 'dup-1', title: 'Same item' }

  it('keeps every path per id and lists the item once, the newest update winning', () => {
    const older = makeAeroItem({ ...same, slug: 'arch', updated: '2026-11-01T00:00:00+00:00' })
    const newer = makeAeroItem({ ...same, slug: 'geral', updated: '2026-11-10T00:00:00+00:00' })
    const index = buildAeroKnowledgeIndex([older, newer])
    expect(index.items).toEqual([newer])
    expect(index.byId.get('dup-1')).toBe(newer)
    expect(index.pathsById.get('dup-1')).toEqual([older.path, newer.path])
  })

  it('breaks an update tie by the smaller path, whatever the input order', () => {
    const first = makeAeroItem({ ...same, slug: 'arch' })
    const second = makeAeroItem({ ...same, slug: 'geral' })
    expect(buildAeroKnowledgeIndex([second, first]).byId.get('dup-1')).toBe(first)
    expect(buildAeroKnowledgeIndex([first, second]).byId.get('dup-1')).toBe(first)
  })
})
