import { describe, expect, it } from 'vitest'
import {
  buildAeroBm25Index,
  parseAeroQueryPhrases,
  searchAeroBm25,
  tokenizeAeroText
} from './aero-bm25-search'

const documents = [
  {
    id: 'title-hit',
    title: 'Orca fork migration',
    body: 'unrelated words',
    tags: [],
    slug: 'arch'
  },
  {
    id: 'body-hit',
    title: 'Release notes',
    body: 'the orca fork was discussed once in passing',
    tags: [],
    slug: 'geral'
  },
  { id: 'tag-hit', title: 'Misc', body: 'nothing here', tags: ['orca'], slug: 'geral' },
  { id: 'common', title: 'Common', body: 'fork fork fork', tags: [], slug: 'geral' },
  { id: 'accent', title: 'Ação rápida', body: 'configuração', tags: [], slug: 'pt' }
]
const index = buildAeroBm25Index(documents)

describe('searchAeroBm25', () => {
  it('ranks a title match above a body match, as the 8x title weight intends', () => {
    const ids = searchAeroBm25(index, parseAeroQueryPhrases('orca fork'), 'all').map((m) => m.id)
    expect(ids).toEqual(['title-hit', 'body-hit'])
  })

  it('requires every term in "all" mode and any term in "any" mode', () => {
    const phrases = parseAeroQueryPhrases('orca fork')
    expect(searchAeroBm25(index, phrases, 'all')).toHaveLength(2)
    expect(
      searchAeroBm25(index, phrases, 'any')
        .map((m) => m.id)
        .sort()
    ).toEqual(['body-hit', 'common', 'tag-hit', 'title-hit'])
  })

  it('weighs a rare term above a common one', () => {
    const ids = searchAeroBm25(index, parseAeroQueryPhrases('fork orca'), 'any').map((m) => m.id)
    expect(ids.indexOf('tag-hit')).toBeLessThan(ids.indexOf('common'))
  })

  it('folds case and diacritics like the unicode61 tokenizer', () => {
    expect(tokenizeAeroText('Ação-RÁPIDA, v2.1')).toEqual(['acao', 'rapida', 'v2', '1'])
    expect(searchAeroBm25(index, parseAeroQueryPhrases('ACAO'), 'all').map((m) => m.id)).toEqual([
      'accent'
    ])
  })

  it('returns nothing when the query has no searchable token', () => {
    expect(searchAeroBm25(index, parseAeroQueryPhrases('— ?'), 'all')).toEqual([])
  })
})
