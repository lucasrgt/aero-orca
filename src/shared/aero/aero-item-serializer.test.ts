import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  aeroItemFileName,
  formatAeroTimestamp,
  renderAeroKnowledgeItem,
  slugifyAeroTitle
} from './aero-item-serializer'
import { parseAeroKnowledgeItem } from './aero-knowledge-item'

const NOW = new Date('2026-11-25T22:00:00Z')
const FIXTURES = join(import.meta.dirname, '__fixtures__')
const roundTripFixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('item-roundtrip-'))

function load(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n')
}

describe('renderAeroKnowledgeItem', () => {
  it('has fixtures to prove it against', () => {
    expect(roundTripFixtures.length).toBeGreaterThanOrEqual(7)
  })

  it.each(roundTripFixtures)('writes %s back byte for byte as network.rs wrote it', (name) => {
    const raw = load(name)
    const parsed = parseAeroKnowledgeItem(raw, name, NOW)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(renderAeroKnowledgeItem(parsed.value)).toBe(raw)
    }
  })

  it.each(roundTripFixtures)('is read back identically by the parser for %s', (name) => {
    const first = parseAeroKnowledgeItem(load(name), name, NOW)
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }
    const second = parseAeroKnowledgeItem(renderAeroKnowledgeItem(first.value), name, NOW)
    expect(second).toEqual(first)
  })

  it('keeps a title or evidence with a line break from forging the next frontmatter key', () => {
    const parsed = parseAeroKnowledgeItem(load('item-roundtrip-empty-tags-links.md'), 'p', NOW)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    const text = renderAeroKnowledgeItem({
      ...parsed.value,
      title: 'one\ndecay: volatile',
      evidence: 'seen\r\nlinks: replaces:x'
    })
    const reread = parseAeroKnowledgeItem(text, 'p', NOW)
    expect(reread.ok && reread.value.decay).toBe('stable')
    expect(reread.ok && reread.value.links).toEqual([])
    expect(reread.ok && reread.value.title).toBe('one decay: volatile')
  })
})

describe('aeroItemFileName', () => {
  it.each([
    [
      '648d7962-229a-4b7d-94a5-0fb078f50bf2',
      'Arch cell digest: current map',
      '648d7962-arch-cell-digest-current-map.md'
    ],
    [
      '155449b0-37b9-4364-aec1-3d96c818ed04',
      'Updater installer is unsigned and triggers Kaspersky PDM behavioral detection',
      '155449b0-updater-installer-is-unsigned-and-triggers-kaspe.md'
    ],
    [
      '0085bc84-04b0-4988-9d66-080268569376',
      'Aba Diagramas REMOVIDA — Mermaid no markdown cobre o caso',
      '0085bc84-aba-diagramas-removida-mermaid-no-markdown-cobre.md'
    ],
    ['0085bc84-04b0-4988-9d66-080268569376', '— ! —', '0085bc84.md']
  ])('names %s %j like network.rs item_path', (id, title, expected) => {
    expect(aeroItemFileName({ id, title })).toBe(expected)
  })

  it('keeps accented letters and cuts at 48 characters without a trailing dash', () => {
    expect(slugifyAeroTitle('Não é “útil” — ação')).toBe('não-é-útil-ação')
    expect(slugifyAeroTitle(`${'a'.repeat(47)} bbb`)).toBe(`${'a'.repeat(47)}`)
  })
})

describe('formatAeroTimestamp', () => {
  it('writes the chrono shape the stale check and Aero both read', () => {
    expect(formatAeroTimestamp(new Date('2026-11-25T22:00:00.123Z'))).toBe(
      '2026-11-25T22:00:00.123+00:00'
    )
    expect(formatAeroTimestamp(new Date('2026-11-25T22:00:00.000Z'))).toBe(
      '2026-11-25T22:00:00+00:00'
    )
  })
})
