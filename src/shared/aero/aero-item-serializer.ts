import type { AeroKnowledgeItem } from './aero-knowledge-item'

/** The fields network.rs persists for an item; everything else on `AeroKnowledgeItem` is derived. */
export type AeroItemRecord = Pick<
  AeroKnowledgeItem,
  | 'id'
  | 'slug'
  | 'title'
  | 'tags'
  | 'provenance'
  | 'evidence'
  | 'decay'
  | 'created'
  | 'updated'
  | 'validated'
  | 'links'
  | 'body'
> & {
  /** Free text: a type Aero does not know stays as written until a store normalizes it. */
  type: string
}

const FILE_TITLE_MAX_CHARS = 48

/** The record to rewrite: a parsed item keeps its raw `type`, not the normalized one it is ranked by. */
export function toAeroItemRecord(item: AeroItemRecord | AeroKnowledgeItem): AeroItemRecord {
  return {
    id: item.id,
    slug: item.slug,
    type: 'rawType' in item ? item.rawType : item.type,
    title: item.title,
    tags: item.tags,
    provenance: item.provenance,
    evidence: item.evidence,
    decay: item.decay,
    created: item.created,
    updated: item.updated,
    validated: item.validated,
    links: item.links,
    body: item.body
  }
}

/** A frontmatter value is one line: a line break would let a value forge the next key. */
export function toAeroSingleLine(value: string): string {
  return value.replace(/\r\n|\r|\n/g, ' ')
}

/** network.rs `render_item`: fixed key order, a blank line after the header, one trailing newline. */
export function renderAeroKnowledgeItem(record: AeroItemRecord): string {
  const links = record.links.map((link) => `${link.kind}:${link.to}`).join(', ')
  return [
    '---',
    `id: ${record.id}`,
    `slug: ${record.slug}`,
    `type: ${record.type}`,
    `title: ${toAeroSingleLine(record.title)}`,
    `tags: ${record.tags.join(', ')}`,
    `provenance: ${record.provenance}`,
    `evidence: ${toAeroSingleLine(record.evidence ?? '')}`,
    `decay: ${record.decay}`,
    `created: ${record.created}`,
    `updated: ${record.updated}`,
    `validated: ${record.validated}`,
    `links: ${links}`,
    '---',
    '',
    `${record.body.trim()}\n`
  ].join('\n')
}

/** network.rs `slug_title`: lowercase alphanumeric runs joined by `-`, at most 48 characters. */
export function slugifyAeroTitle(title: string): string {
  const words = [...title.toLowerCase()]
    .map((char) => (/[\p{Alphabetic}\p{N}]/u.test(char) ? char : '-'))
    .join('')
    .split('-')
    .filter((word) => word.length > 0)
  return [...words.join('-')]
    .slice(0, FILE_TITLE_MAX_CHARS)
    .join('')
    .replace(/^-+|-+$/g, '')
}

export function aeroIdPrefix(id: string): string {
  return [...id].slice(0, 8).join('')
}

/** network.rs `item_path` file name: `<id8>-<title-slug>.md`. */
export function aeroItemFileName(record: Pick<AeroItemRecord, 'id' | 'title'>): string {
  const idPrefix = aeroIdPrefix(record.id)
  const name = slugifyAeroTitle(record.title)
  return name.length > 0 ? `${idPrefix}-${name}.md` : `${idPrefix}.md`
}

/** Repo-relative folder segments of an item: its slug split at `/`, under `.aerofortress/items`. */
export function aeroItemFolderSegments(slug: string): string[] {
  return slug.split('/').filter((segment) => segment.length > 0)
}

/** chrono `to_rfc3339` in UTC: the fraction has as many digits as it needs (none, or milliseconds here). */
export function formatAeroTimestamp(now: Date): string {
  const [seconds, fraction] = now.toISOString().slice(0, -1).split('.')
  return `${seconds}${fraction === '000' ? '' : `.${fraction}`}+00:00`
}
