import {
  isAeroTomlTable,
  type AeroTomlTable,
  type AeroTomlValue
} from './aero-toml-document-writer'

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x00000100000001b3n
const U64_MASK = 0xffffffffffffffffn
const PART_SEPARATOR = 0x1f

// Rust's `str::trim` strips exactly the Unicode White_Space set (not U+FEFF, which JS trims).
const RUST_WHITESPACE =
  /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g

export function trimLikeRust(text: string): string {
  return text.replace(RUST_WHITESPACE, '')
}

function text(table: AeroTomlTable, key: string): string {
  const value = table[key]
  return typeof value === 'string' ? value : ''
}

function tables(value: AeroTomlValue | undefined): AeroTomlTable[] {
  return Array.isArray(value) ? value.filter(isAeroTomlTable) : []
}

/** kanban.rs `card_text_parts`: what counts as the card's text, in a fixed order. */
export function aeroKanbanCardTextParts(card: AeroTomlTable): string[] {
  const parts = [text(card, 'title'), text(card, 'desc')]
  parts.push(...tables(card.subtasks).map((subtask) => text(subtask, 'title')))
  const spec = card.spec
  if (isAeroTomlTable(spec) && spec.edited === true) {
    parts.push('spec', text(spec, 'story'))
    for (const criterion of tables(spec.acceptance)) {
      parts.push(text(criterion, 'given'), text(criterion, 'when'), text(criterion, 'then'))
    }
  }
  for (const clarification of tables(card.clarifications)) {
    if (trimLikeRust(text(clarification, 'answer')) !== '') {
      parts.push('clarification', text(clarification, 'question'), text(clarification, 'answer'))
    }
  }
  return parts
}

/** kanban.rs `card_text_hash`: FNV-1a 64 over the trimmed parts, each closed by 0x1f, as 16 hex digits. */
export function aeroKanbanCardTextHash(card: AeroTomlTable): string {
  let hash = FNV_OFFSET
  const encoder = new TextEncoder()
  for (const part of aeroKanbanCardTextParts(card)) {
    for (const byte of [...encoder.encode(trimLikeRust(part)), PART_SEPARATOR]) {
      hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & U64_MASK
    }
  }
  return hash.toString(16).padStart(16, '0')
}
