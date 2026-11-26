import {
  aeroItemFileName,
  aeroItemFolderSegments,
  formatAeroTimestamp,
  toAeroSingleLine,
  type AeroItemRecord
} from './aero-item-serializer'
import {
  AERO_DECAYS,
  AERO_PROVENANCES,
  normalizeAeroItemType,
  normalizeAeroSlug
} from './aero-knowledge-item'

export const AERO_LINK_KINDS = ['depends_on', 'references', 'replaces', 'duplicates'] as const

export type AeroStoreInput = {
  slug: string
  type: string
  title: string
  body: string
  tags: string[]
  provenance: string
  evidence?: string
  decay?: string
}

/** The fields that land in a one-line frontmatter value must not smuggle in a line break. */
function oneLine(value: string): string {
  return toAeroSingleLine(value).trim()
}

function checkVocabulary(label: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`)
  }
}

function checkedFields(input: AeroStoreInput) {
  if (input.title.trim().length === 0) {
    throw new Error('title must not be empty')
  }
  checkVocabulary('provenance', input.provenance, AERO_PROVENANCES)
  if (input.decay !== undefined) {
    checkVocabulary('decay', input.decay, AERO_DECAYS)
  }
  return {
    slug: normalizeAeroSlug(input.slug),
    type: normalizeAeroItemType(input.type),
    title: input.title,
    body: input.body,
    tags: input.tags.map((tag) => oneLine(tag.replaceAll(',', ' '))),
    provenance: input.provenance,
    evidence: input.evidence === undefined ? null : oneLine(input.evidence)
  }
}

/** network.rs `store_item`, no `id`: a fresh item stamped with `now` three times. */
export function createAeroItemRecord(input: AeroStoreInput, id: string, now: Date): AeroItemRecord {
  const stamp = formatAeroTimestamp(now)
  return {
    id,
    ...checkedFields(input),
    decay: input.decay ?? 'stable',
    created: stamp,
    updated: stamp,
    validated: stamp,
    links: []
  }
}

/**
 * network.rs `store_item`, with `id`: every field is rewritten, but the id, the creation time, the
 * links and (unless a new one is given) the decay survive. Updating also revalidates.
 */
export function updateAeroItemRecord(
  existing: AeroItemRecord,
  input: AeroStoreInput,
  now: Date
): AeroItemRecord {
  const stamp = formatAeroTimestamp(now)
  return {
    ...existing,
    ...checkedFields(input),
    decay: input.decay ?? existing.decay,
    updated: stamp,
    validated: stamp
  }
}

/** network.rs `validate_item`: only the `validated` stamp moves. */
export function validateAeroItemRecord(existing: AeroItemRecord, now: Date): AeroItemRecord {
  return { ...existing, validated: formatAeroTimestamp(now) }
}

/** network.rs `link`: an already present (kind, target) pair changes nothing at all. */
export function linkAeroItemRecord(
  existing: AeroItemRecord,
  kind: string,
  to: string,
  now: Date
): AeroItemRecord {
  checkVocabulary('kind', kind, AERO_LINK_KINDS)
  if (to.trim().length === 0 || /[,\r\n]/.test(to)) {
    throw new Error('to must be an item id')
  }
  if (existing.links.some((link) => link.kind === kind && link.to === to)) {
    return existing
  }
  return {
    ...existing,
    links: [...existing.links, { kind, to }],
    updated: formatAeroTimestamp(now)
  }
}

/** Repo-relative location an item is stored at: `.aerofortress/items/<slug>/<id8>-<title>.md`. */
export function aeroItemStoragePath(record: Pick<AeroItemRecord, 'id' | 'slug' | 'title'>): {
  folders: string[]
  fileName: string
} {
  return { folders: aeroItemFolderSegments(record.slug), fileName: aeroItemFileName(record) }
}
