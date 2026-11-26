import { describe, expect, it } from 'vitest'
import { packAeroKnowledge } from './aero-knowledge-pack'
import { makeAeroIndex, makeAeroItem, TEST_NOW } from './aero-knowledge-test-items'

const index = makeAeroIndex([
  makeAeroItem({
    id: 'c1',
    slug: 'geral',
    title: 'Constitution',
    tags: ['constituicao'],
    body: 'never skip tests'
  }),
  makeAeroItem({
    id: 'd1',
    slug: 'research',
    title: 'Digest research',
    tags: ['digesto'],
    body: 'map of research'
  }),
  makeAeroItem({ id: 'r1', slug: 'research', title: 'Research one', body: 'first finding' }),
  makeAeroItem({ id: 'r2', slug: 'research', title: 'Research two', body: 'second finding' }),
  makeAeroItem({ id: 'o1', slug: 'other', title: 'Other cell', body: 'elsewhere' })
])

function titlesIn(pack: string): string[] {
  return [...pack.matchAll(/^### \[[^\]]*\] (.+)$/gm)].map((match) => match[1])
}

describe('packAeroKnowledge', () => {
  it('orders the constitution, then the digests, then the rest, and honours the slug filter', () => {
    const pack = packAeroKnowledge(index, ['research'], 2000, TEST_NOW)
    const titles = titlesIn(pack)
    expect(titles.slice(0, 2)).toEqual(['Constitution', 'Digest research'])
    expect(titles.slice(2).sort()).toEqual(['Research one', 'Research two'])
    expect(pack).not.toContain('Other cell')
  })

  it('cuts at the budget and says how many items stayed out', () => {
    const bulky = makeAeroIndex(
      ['a', 'b', 'c', 'd', 'e'].map((id) =>
        makeAeroItem({ id, title: `Bulky ${id}`, body: 'x'.repeat(300) })
      )
    )
    const pack = packAeroKnowledge(bulky, undefined, 0, TEST_NOW)
    const [shown, footer] = pack.split('\n(+')
    expect(Buffer.byteLength(shown)).toBeLessThanOrEqual(200 * 4)
    expect(footer).toBe(
      `${5 - titlesIn(pack).length} items fora do ambiente — query/explore puxa sob demanda)`
    )
    expect(titlesIn(pack).length).toBeLessThan(5)
  })

  it('shows every item with no footer when the budget is generous', () => {
    const pack = packAeroKnowledge(index, undefined, 2000, TEST_NOW)
    expect(titlesIn(pack)).toHaveLength(5)
    expect(pack).not.toContain('fora do ambiente')
  })
})
