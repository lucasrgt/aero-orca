import type { AeroNyaScar } from './aero-nya'
import { matchesAeroNyaScope } from './aero-nya-glob'
import { tokenizeAeroText } from './aero-bm25-search'

// not-you-again recalls through an FTS5 table over (title, lesson, tags, scope), every column
// weighted 1, queried with `"term"* OR ...` and ordered by bm25. This is that ranking in memory.

export const AERO_NYA_DEFAULT_RECALL_LIMIT = 12
const MAX_QUERY_TERMS = 128
const MAX_RANKED_ROWS = 256
const BM25_K1 = 1.2
const BM25_B = 0.75
const MIN_IDF = 1e-6

export type AeroNyaRecallRequest = {
  task: string
  paths: readonly string[]
  limit?: number
}

/** The query terms: words of the paths and the task, 2+ bytes long, unique, at most 128. */
export function buildAeroNyaRecallTerms(task: string, paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  const words = [...paths, task].flatMap((text) => text.split(/[^\p{L}\p{N}]+/u))
  for (const word of words) {
    if (Buffer.byteLength(word) <= 1) {
      continue
    }
    const term = word.toLowerCase()
    if (!seen.has(term)) {
      seen.add(term)
      terms.push(term)
      if (terms.length === MAX_QUERY_TERMS) {
        break
      }
    }
  }
  return terms
}

type IndexedScar = { scar: AeroNyaScar; tokens: string[] }

function indexScar(scar: AeroNyaScar): IndexedScar {
  const columns = [scar.title, scar.lesson, scar.tags.join(' '), scar.scope.join(' ')]
  return { scar, tokens: columns.flatMap((column) => tokenizeAeroText(column)) }
}

/** Occurrences of a prefix phrase `"a b"*`: the words in order, the last one a prefix. */
function countPrefixPhrase(tokens: readonly string[], phrase: readonly string[]): number {
  let count = 0
  const lastIndex = phrase.length - 1
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    const matches = phrase.every((word, offset) =>
      offset === lastIndex
        ? tokens[start + offset].startsWith(word)
        : tokens[start + offset] === word
    )
    if (matches) {
      count += 1
    }
  }
  return count
}

/** Scar ids by rank, best bm25 first, at most 256 like the `LIMIT 256` of the FTS query. */
function rankByBm25(
  indexed: readonly IndexedScar[],
  terms: readonly string[]
): Map<string, number> {
  const phrases = terms.map((term) => tokenizeAeroText(term)).filter((phrase) => phrase.length > 0)
  const rows = indexed.length
  const frequencies = indexed.map(({ tokens }) =>
    phrases.map((phrase) => countPrefixPhrase(tokens, phrase))
  )
  const idfs = phrases.map((_, phraseIndex) => {
    const hits = frequencies.filter((row) => row[phraseIndex] > 0).length
    const idf = Math.log((rows - hits + 0.5) / (hits + 0.5))
    return idf > 0 ? idf : MIN_IDF
  })
  const totalLength = indexed.reduce((total, { tokens }) => total + tokens.length, 0)
  const averageLength = rows > 0 ? totalLength / rows : 0
  const scored = indexed.flatMap(({ scar, tokens }, rowIndex) => {
    const row = frequencies[rowIndex]
    if (!row.some((frequency) => frequency > 0)) {
      return []
    }
    const norm =
      averageLength > 0
        ? BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / averageLength)
        : BM25_K1
    const score = row.reduce(
      (total, frequency, phraseIndex) =>
        total + (idfs[phraseIndex] * frequency * (BM25_K1 + 1)) / (frequency + norm),
      0
    )
    return [{ id: scar.id, score }]
  })
  scored.sort((a, b) => b.score - a.score)
  return new Map(scored.slice(0, MAX_RANKED_ROWS).map(({ id }, rank) => [id, rank]))
}

/**
 * The scars relevant to a task and the paths it will touch, as `nya recall` returns them: scoped
 * and text-matched first, then text-matched, then scoped only, ties by text rank then by how often
 * the scar recurred. `scars` must come in file-name order. No terms at all returns every scar.
 */
export function recallAeroNyaScars(
  scars: readonly AeroNyaScar[],
  request: AeroNyaRecallRequest
): AeroNyaScar[] {
  const terms = buildAeroNyaRecallTerms(request.task, request.paths)
  const ranks =
    terms.length === 0 ? new Map<string, number>() : rankByBm25(scars.map(indexScar), terms)
  const entries = scars
    .map((scar) => ({
      scar,
      scoped: matchesAeroNyaScope(scar.scope, request.paths),
      rank: ranks.get(scar.id)
    }))
    .filter((entry) => terms.length === 0 || entry.scoped || entry.rank !== undefined)
  const tier = (entry: { scoped: boolean; rank: number | undefined }): number => {
    if (entry.rank !== undefined) {
      return entry.scoped ? 0 : 1
    }
    return entry.scoped ? 2 : 3
  }
  entries.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      b.scar.occurrences.length - a.scar.occurrences.length
  )
  return entries.slice(0, request.limit ?? AERO_NYA_DEFAULT_RECALL_LIMIT).map(({ scar }) => scar)
}
