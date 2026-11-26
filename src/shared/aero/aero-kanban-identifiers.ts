import { randomUUID } from 'node:crypto'

const MAX_ID_SLUG_CHARS = 32
const ID_SUFFIX_CHARS = 6

/** kanban.rs `slugify`: kebab-case ascii alphanumerics, `card` when nothing is left. */
export function slugifyAeroKanban(text: string): string {
  let output = ''
  let previousDash = false
  for (const char of text.trim()) {
    if (/^[A-Za-z0-9]$/.test(char)) {
      output += char.toLowerCase()
      previousDash = false
    } else if (!previousDash && output.length > 0) {
      output += '-'
      previousDash = true
    }
  }
  const trimmed = output.replace(/^-+|-+$/g, '')
  return trimmed.length > 0 ? trimmed : 'card'
}

/** A readable unique card id: the title slug (32 chars at most) and a short random suffix. */
export function newAeroKanbanCardId(title: string): string {
  const base = [...slugifyAeroKanban(title)].slice(0, MAX_ID_SLUG_CHARS).join('')
  return `${base}-${randomUUID().replaceAll('-', '').slice(0, ID_SUFFIX_CHARS)}`
}

export type AeroKanbanRef = { board: string; card: string }

/** A `board/cardid` ref: the first `/` splits, both halves are trimmed and neither may be empty. */
export function parseAeroKanbanRef(ref: string): AeroKanbanRef | null {
  const slash = ref.indexOf('/')
  if (slash === -1) {
    return null
  }
  const board = ref.slice(0, slash).trim()
  const card = ref.slice(slash + 1).trim()
  return board === '' || card === '' ? null : { board, card }
}

/** A normalised ref: the board part is always slugified so refs compare equal across producers. */
export function makeAeroKanbanRef(board: string, card: string): string {
  return `${slugifyAeroKanban(board)}/${card}`
}

/** rfc3339 in chrono's `to_rfc3339` shape: UTC as `+00:00`, the fraction only when it is not zero. */
export function aeroKanbanTimestamp(at: Date): string {
  return at.toISOString().replace('.000Z', 'Z').replace('Z', '+00:00')
}
