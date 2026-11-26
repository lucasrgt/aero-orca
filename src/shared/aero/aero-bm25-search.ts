// An in-memory counterpart of the FTS5 table network.rs queries: the same fields, the same field
// weights and the same bm25 formula (k1 1.2, b 0.75), so rankings stay comparable with Aero's.

type AeroSearchField = 'title' | 'body' | 'tags' | 'slug'

export type AeroSearchDocument = {
  id: string
  title: string
  body: string
  tags: readonly string[]
  slug: string
}

type IndexedDocument = {
  id: string
  fields: Record<AeroSearchField, string[]>
  length: number
}

export type AeroBm25Index = { documents: IndexedDocument[]; averageLength: number }

export type AeroBm25Match = { id: string; score: number }

const FIELD_WEIGHTS: Record<AeroSearchField, number> = { title: 8, body: 1, tags: 4, slug: 2 }
const FIELDS = Object.keys(FIELD_WEIGHTS) as AeroSearchField[]
const BM25_K1 = 1.2
const BM25_B = 0.75
const MIN_IDF = 1e-6

/** FTS5 `unicode61 remove_diacritics 2`: letters and digits make tokens, case and accents are folded. */
export function tokenizeAeroText(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
}

export function buildAeroBm25Index(documents: readonly AeroSearchDocument[]): AeroBm25Index {
  const indexed = documents.map((document) => {
    const fields: Record<AeroSearchField, string[]> = {
      title: tokenizeAeroText(document.title),
      body: tokenizeAeroText(document.body),
      tags: tokenizeAeroText(document.tags.join(' ')),
      slug: tokenizeAeroText(document.slug.replaceAll('/', ' '))
    }
    const length = FIELDS.reduce((total, field) => total + fields[field].length, 0)
    return { id: document.id, fields, length }
  })
  const totalLength = indexed.reduce((total, document) => total + document.length, 0)
  return {
    documents: indexed,
    averageLength: indexed.length > 0 ? totalLength / indexed.length : 0
  }
}

/** network.rs wraps every whitespace-separated term in quotes: each becomes one phrase of tokens. */
export function parseAeroQueryPhrases(query: string): string[][] {
  return query
    .split(/\s+/)
    .map((term) => tokenizeAeroText(term))
    .filter((tokens) => tokens.length > 0)
}

function countPhrase(tokens: readonly string[], phrase: readonly string[]): number {
  let count = 0
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((token, offset) => tokens[start + offset] === token)) {
      count += 1
    }
  }
  return count
}

function weightedFrequency(document: IndexedDocument, phrase: readonly string[]): number {
  return FIELDS.reduce(
    (total, field) => total + FIELD_WEIGHTS[field] * countPhrase(document.fields[field], phrase),
    0
  )
}

/**
 * Documents holding every phrase (`all`, the implicit AND of the quoted terms) or any of them
 * (`any`), best first. The score is the positive bm25 value; FTS5 reports it negated.
 */
export function searchAeroBm25(
  index: AeroBm25Index,
  phrases: readonly (readonly string[])[],
  mode: 'all' | 'any'
): AeroBm25Match[] {
  if (phrases.length === 0) {
    return []
  }
  const rows = index.documents.length
  const frequencies = index.documents.map((document) =>
    phrases.map((phrase) => weightedFrequency(document, phrase))
  )
  const idfs = phrases.map((_, phraseIndex) => {
    const hits = frequencies.filter((row) => row[phraseIndex] > 0).length
    const idf = Math.log((rows - hits + 0.5) / (hits + 0.5))
    return idf > 0 ? idf : MIN_IDF
  })
  const matches: AeroBm25Match[] = []
  index.documents.forEach((document, rowIndex) => {
    const row = frequencies[rowIndex]
    const matched = mode === 'all' ? row.every((f) => f > 0) : row.some((f) => f > 0)
    if (!matched) {
      return
    }
    const lengthNorm =
      index.averageLength > 0
        ? BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / index.averageLength)
        : BM25_K1
    const score = row.reduce(
      (total, frequency, phraseIndex) =>
        total + (idfs[phraseIndex] * frequency * (BM25_K1 + 1)) / (frequency + lengthNorm),
      0
    )
    matches.push({ id: document.id, score })
  })
  return matches.sort((a, b) => b.score - a.score)
}
