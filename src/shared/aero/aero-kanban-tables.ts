import { AERO_KANBAN_TABLES } from './aero-kanban-schema'
import { trimLikeRust } from './aero-kanban-text-hash'
import {
  isAeroTomlSection,
  isAeroTomlTable,
  type AeroTomlTable,
  type AeroTomlValue
} from './aero-toml-document-writer'

/** A failure the agent is told about as it is (a missing board or card, a refused value). */
export class AeroKanbanError extends Error {}

export function readString(table: AeroTomlTable, key: string): string {
  const value = table[key]
  return typeof value === 'string' ? value : ''
}

export function readStrings(table: AeroTomlTable, key: string): string[] {
  const value = table[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export function readTables(table: AeroTomlTable, key: string): AeroTomlTable[] {
  const value = table[key]
  return Array.isArray(value) ? value.filter(isAeroTomlTable) : []
}

/** An own, enumerable key even when it is named `__proto__`, which plain assignment would drop. */
function defineKey(table: AeroTomlTable, key: string, value: AeroTomlValue): void {
  Object.defineProperty(table, key, { value, enumerable: true, writable: true, configurable: true })
}

/**
 * Sets `key`, replacing in place when present; a new key goes right after the last key that precedes
 * it in `order` (struct order), so the file keeps the shape Aero writes. A key that turns from a plain
 * value into a section (`card = []` gaining its first card) or back is placed anew the same way, since
 * a parsed file lists every value before every section. Unknown keys never move.
 */
export function setKnownKey(
  table: AeroTomlTable,
  key: string,
  value: AeroTomlValue,
  order: readonly string[]
): void {
  if (Object.hasOwn(table, key)) {
    if (isAeroTomlSection(table[key]) === isAeroTomlSection(value)) {
      table[key] = value
      return
    }
    delete table[key]
  }
  const rank = order.indexOf(key)
  const entries = Object.entries(table)
  let insertAt = 0
  entries.forEach(([existing], index) => {
    const existingRank = order.indexOf(existing)
    if (existingRank !== -1 && existingRank < rank) {
      insertAt = index + 1
    }
  })
  entries.splice(insertAt, 0, [key, value])
  for (const [existing] of entries) {
    delete table[existing]
  }
  for (const [existing, entry] of entries) {
    defineKey(table, existing, entry)
  }
}

/** `next` plus the keys `previous` holds that the reader does not know, so a replaced table keeps them. */
export function carryUnknownKeys(
  next: AeroTomlTable,
  previous: AeroTomlTable | undefined,
  tableName: string
): AeroTomlTable {
  const known = new Set((AERO_KANBAN_TABLES[tableName] ?? []).map(([key]) => key))
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (!known.has(key) && !Object.hasOwn(next, key)) {
      defineKey(next, key, value)
    }
  }
  return next
}

/** Trims, then keeps at most `max` characters (kanban.rs `cap_chars`). */
export function capChars(text: string, max: number): string {
  return [...trimLikeRust(text)].slice(0, max).join('')
}
