import {
  aeroItemFileName,
  aeroItemFolderSegments,
  formatAeroTimestamp,
  toAeroSingleLine,
  type AeroItemRecord
} from './aero-item-serializer'
import { normalizeAeroItemType, normalizeAeroSlug } from './aero-knowledge-item'

/** The kinds Aero's relation graph understands; others are stored as written, like Aero does. */
export const AERO_LINK_KINDS = ['depends_on', 'references', 'replaces', 'duplicates'] as const

const SAFE_ITEM_ID = /^[A-Za-z0-9-]+$/

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

/**
 * An id lands in the file name of the rewritten item, and it comes from a file on disk: only
 * letters, digits and hyphens may name a path.
 */
export function assertSafeAeroItemId(id: string): void {
  if (!SAFE_ITEM_ID.test(id)) {
    throw new Error(
      `item id "${toAeroSingleLine(id).slice(0, 80)}" is not a valid id ([A-Za-z0-9-]+); refusing to write it`
    )
  }
}

function checkedFields(input: AeroStoreInput) {
  if (input.title.trim().length === 0) {
    throw new Error('title must not be empty')
  }
  // Aero accepts any provenance or decay and only warns when it reads one it does not know.
  return {
    slug: normalizeAeroSlug(input.slug),
    type: normalizeAeroItemType(input.type),
    title: input.title,
    body: input.body,
    tags: input.tags.map((tag) => oneLine(tag.replaceAll(',', ' '))),
    provenance: oneLine(input.provenance),
    evidence: input.evidence === undefined ? null : oneLine(input.evidence)
  }
}

/** network.rs `store_item`, no `id`: a fresh item stamped with `now` three times. */
export function createAeroItemRecord(input: AeroStoreInput, id: string, now: Date): AeroItemRecord {
  const stamp = formatAeroTimestamp(now)
  return {
    id,
    ...checkedFields(input),
    decay: input.decay === undefined ? 'stable' : oneLine(input.decay),
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
  assertSafeAeroItemId(existing.id)
  const stamp = formatAeroTimestamp(now)
  return {
    ...existing,
    ...checkedFields(input),
    decay: input.decay === undefined ? existing.decay : oneLine(input.decay),
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
  if (to.trim().length === 0 || /[,\r\n]/.test(to)) {
    throw new Error('to must be an item id')
  }
  // Any kind is stored as written, but these characters would corrupt the one-line `links` value.
  if (kind.trim().length === 0 || /[,:\r\n]/.test(kind)) {
    throw new Error('kind must be one word without commas, colons or line breaks')
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
