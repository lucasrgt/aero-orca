import { aeroIdPrefix, slugifyAeroTitle } from './aero-item-serializer'
import type { AeroKnowledgeItem } from './aero-knowledge-item'

export type AeroRelationOrigin = 'explicita' | 'inferida'

export type AeroRelation = {
  from: string
  to: string
  kind: string
  origin: AeroRelationOrigin
}

const MIN_CITED_TITLE_CHARS = 12
const MAX_ITEMS_FOR_TITLE_CITATIONS = 1500
const MAX_WIKI_TOKEN_BYTES = 80
const ID_PREFIX_CHARS = 8

/** network.rs `wiki_tokens`: the `[[...]]` references in a body. */
function wikiTokens(body: string): string[] {
  const tokens: string[] = []
  let rest = body
  for (;;) {
    const open = rest.indexOf('[[')
    if (open === -1) {
      return tokens
    }
    rest = rest.slice(open + 2)
    const close = rest.indexOf(']]')
    if (close === -1) {
      return tokens
    }
    const token = rest.slice(0, close).trim()
    if (token.length > 0 && Buffer.byteLength(token) <= MAX_WIKI_TOKEN_BYTES) {
      tokens.push(token)
    }
    rest = rest.slice(close + 2)
  }
}

type TitleForms = { lower: string; slug: string }

function resolveWikiToken(
  items: readonly AeroKnowledgeItem[],
  titles: readonly TitleForms[],
  token: string
) {
  const lower = token.toLowerCase()
  const tokenSlug = slugifyAeroTitle(token)
  return items.find(
    (item, index) =>
      item.id.startsWith(lower) ||
      titles[index].lower === lower ||
      (tokenSlug.length > 0 && titles[index].slug === tokenSlug)
  )
}

/** Every position of `body` that starts one of the 8-character id prefixes. */
function citedIdPrefixes(body: string, owners: ReadonlyMap<string, AeroKnowledgeItem[]>) {
  const cited = new Set<AeroKnowledgeItem>()
  for (let start = 0; start + ID_PREFIX_CHARS <= body.length; start += 1) {
    for (const owner of owners.get(body.slice(start, start + ID_PREFIX_CHARS)) ?? []) {
      cited.add(owner)
    }
  }
  return cited
}

/**
 * network.rs `reindex` + `infer_edges`: the explicit `links:` edges, then a `references` edge for
 * every body that names another item by `[[wiki]]` token, by id prefix, or by its whole title.
 */
export function deriveAeroRelations(items: readonly AeroKnowledgeItem[]): AeroRelation[] {
  const relations: AeroRelation[] = []
  const seen = new Set<string>()
  for (const item of items) {
    for (const link of item.links) {
      relations.push({ from: item.id, to: link.to, kind: link.kind, origin: 'explicita' })
      seen.add(`${item.id}\u0000${link.to}`)
    }
  }
  const addInferred = (from: string, to: string): void => {
    const key = `${from}\u0000${to}`
    if (from !== to && !seen.has(key)) {
      seen.add(key)
      relations.push({ from, to, kind: 'references', origin: 'inferida' })
    }
  }
  const owners = new Map<string, AeroKnowledgeItem[]>()
  for (const item of items) {
    const prefix = aeroIdPrefix(item.id)
    owners.set(prefix, [...(owners.get(prefix) ?? []), item])
  }
  const citeTitles = items.length <= MAX_ITEMS_FOR_TITLE_CITATIONS
  const titles = items.map((item) => ({
    lower: item.title.toLowerCase(),
    slug: slugifyAeroTitle(item.title)
  }))
  for (const item of items) {
    for (const token of wikiTokens(item.body)) {
      const target = resolveWikiToken(items, titles, token)
      if (target) {
        addInferred(item.id, target.id)
      }
    }
    const lowerBody = item.body.toLowerCase()
    const citedByPrefix = citedIdPrefixes(lowerBody, owners)
    items.forEach((other, index) => {
      if (other === item) {
        return
      }
      const title = titles[index].lower
      const citesTitle =
        citeTitles && [...title].length >= MIN_CITED_TITLE_CHARS && lowerBody.includes(title)
      if (citedByPrefix.has(other) || citesTitle) {
        addInferred(item.id, other.id)
      }
    })
  }
  return relations
}

export function countAeroDegrees(relations: readonly AeroRelation[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const relation of relations) {
    degrees.set(relation.from, (degrees.get(relation.from) ?? 0) + 1)
    if (relation.to !== relation.from) {
      degrees.set(relation.to, (degrees.get(relation.to) ?? 0) + 1)
    }
  }
  return degrees
}
