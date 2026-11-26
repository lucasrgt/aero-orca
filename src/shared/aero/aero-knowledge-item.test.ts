import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectAeroReplacedIds,
  isAeroItemStale,
  normalizeAeroSlug,
  parseAeroKnowledgeItem
} from './aero-knowledge-item'

const NOW = new Date('2026-11-25T22:00:00Z')
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

describe('parseAeroKnowledgeItem', () => {
  it('reads comma tags, empty links and an evidence line from the real item layout', () => {
    const result = parseAeroKnowledgeItem(
      fixture('item-seasonal-comma-tags.md'),
      '.aerofortress/items/arch/842038ca.md',
      NOW
    )
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value).toMatchObject({
      id: '842038ca-3c38-48d2-8d42-71b10a398139',
      slug: 'arch',
      type: 'fact',
      tags: ['gemini', 'antigravity', 'provider', 'subscription'],
      provenance: 'observado',
      decay: 'seasonal',
      links: [],
      isDigest: false,
      isConstitution: false,
      stale: false,
      replaced: false
    })
    expect(result.value.evidence).toBe(
      'User screenshot 2026-11-25 (Gemini CLI sign-in error); https://9to5google.com/2026/06/17/gemini-cli-code-assist-shutting-down/'
    )
    expect(result.value.body.startsWith('Observed on 2026-11-25')).toBe(true)
  })

  it('parses kind:id links, a nested slug and flags digests; empty evidence is null', () => {
    const result = parseAeroKnowledgeItem(fixture('item-digest-with-replaces-link.md'), 'p', NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.slug).toBe('aerofortress-harness/arch')
    expect(result.value.links).toEqual([
      { kind: 'replaces', to: '9e88d798-cde4-4a49-baa1-4b8a7deb5844' },
      { kind: 'references', to: '402295f3-0000-4000-8000-000000000000' }
    ])
    expect(result.value.isDigest).toBe(true)
    expect(result.value.evidence).toBeNull()
  })

  it('parses a CRLF file the same as its LF form', () => {
    // The fixture is pinned to LF in .gitattributes; the CRLF form is built here so it is always CRLF.
    const lfText = fixture('item-seasonal-comma-tags.md')
    expect(lfText).not.toContain('\r')
    const crlfText = lfText.replace(/\n/g, '\r\n')
    expect(crlfText).toContain('\r\n')
    const lf = parseAeroKnowledgeItem(lfText, 'p', NOW)
    const crlf = parseAeroKnowledgeItem(crlfText, 'p', NOW)
    expect(crlf.ok && lf.ok && crlf.value.body.replaceAll('\r\n', '\n')).toBe(
      lf.ok && lf.value.body
    )
    expect(crlf.ok && { ...crlf.value, body: '' }).toEqual(lf.ok && { ...lf.value, body: '' })
  })

  it('flags the constitution tag, defaults the type and stamps missing dates like network.rs', () => {
    const result = parseAeroKnowledgeItem(
      '---\nid: a\ntitle: Rules\ntype: nonsense\ntags: constituicao\n---\nBody\n',
      'p',
      NOW
    )
    expect(result).toMatchObject({
      ok: true,
      value: {
        type: 'fact',
        slug: 'geral',
        provenance: 'importado',
        decay: 'stable',
        isConstitution: true,
        created: '2026-11-25T22:00:00.000Z',
        validated: '2026-11-25T22:00:00.000Z',
        body: 'Body'
      }
    })
  })

  it('rejects a file without frontmatter or without an id or title', () => {
    expect(parseAeroKnowledgeItem('# just markdown', 'p', NOW)).toEqual({
      ok: false,
      issues: ['missing "---" frontmatter block']
    })
    expect(parseAeroKnowledgeItem('---\ntitle: T\n---\nx', 'p', NOW).ok).toBe(false)
    expect(parseAeroKnowledgeItem('---\nid: a\n---\nx', 'p', NOW).ok).toBe(false)
  })
})

describe('isAeroItemStale', () => {
  it('uses 30, 180 and 730 day windows and treats an unreadable date as stale', () => {
    const validated = '2026-10-25T22:00:00Z'
    expect(isAeroItemStale('volatile', validated, NOW)).toBe(true)
    expect(isAeroItemStale('seasonal', validated, NOW)).toBe(false)
    expect(isAeroItemStale('stable', '2024-11-26T22:00:00Z', NOW)).toBe(false)
    expect(isAeroItemStale('stable', '2024-11-24T22:00:00Z', NOW)).toBe(true)
    expect(isAeroItemStale('stable', 'yesterday', NOW)).toBe(true)
  })
})

describe('normalizeAeroSlug', () => {
  it('keeps nested cells and falls back to geral', () => {
    expect(normalizeAeroSlug(' Pleiades-Harness/Harness ')).toBe('pleiades-harness/harness')
    expect(normalizeAeroSlug('a b!c')).toBe('a-b-c')
    expect(normalizeAeroSlug('///')).toBe('geral')
  })
  it('keeps alphabetic marks, as Rust is_alphanumeric does', () => {
    // U+093E is a Devanagari vowel sign (category Mc): Alphabetic, but not a letter (L).
    expect(normalizeAeroSlug('का')).toBe('का')
  })
})

describe('collectAeroReplacedIds', () => {
  it('collects the targets of replaces links only', () => {
    const result = parseAeroKnowledgeItem(fixture('item-digest-with-replaces-link.md'), 'p', NOW)
    expect(result.ok && [...collectAeroReplacedIds([result.value])]).toEqual([
      '9e88d798-cde4-4a49-baa1-4b8a7deb5844'
    ])
  })
})
