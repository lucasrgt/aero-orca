import { isAbsolute, relative, resolve } from 'node:path'
import { AERO_KANBAN_TABLES } from './aero-kanban-schema'
import { readString, readTables } from './aero-kanban-tables'
import { aeroKanbanCardTextHash } from './aero-kanban-text-hash'
import {
  isAeroTomlTable,
  type AeroTomlTable,
  type AeroTomlValue
} from './aero-toml-document-writer'

export type AeroKanbanJson = Record<string, unknown>

export function aeroTomlToJson(value: AeroTomlValue): unknown {
  if (typeof value === 'bigint') {
    return Number(value)
  }
  if (Array.isArray(value)) {
    return value.map(aeroTomlToJson)
  }
  if (isAeroTomlTable(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, aeroTomlToJson(entry)])
    )
  }
  return value
}

function numberOf(value: AeroTomlValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : 0
}

function isEmpty(value: unknown): boolean {
  return value === '' || value === false || (Array.isArray(value) && value.length === 0)
}

function scalarOf(kind: string, raw: AeroTomlValue | undefined): unknown {
  switch (kind) {
    case 's':
      return typeof raw === 'string' ? raw : ''
    case 'b':
      return raw === true
    case 'n':
    case 'f':
      return numberOf(raw)
    case 'S':
      return Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'string') : []
    default:
      return Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'boolean') : []
  }
}

/** One table as serde_json prints the Rust struct: every field, defaults filled, omissions applied. */
function viewTable(name: string, source: AeroTomlTable | undefined): AeroKanbanJson {
  const view: AeroKanbanJson = {}
  const fields = AERO_KANBAN_TABLES[name] ?? []
  for (const [key, kind, omit] of fields) {
    const raw = source?.[key]
    if (kind.startsWith('t:')) {
      if (isAeroTomlTable(raw)) {
        view[key] = viewTable(kind.slice(2), raw)
      } else if (omit !== 'absent') {
        view[key] = viewTable(kind.slice(2), undefined)
      }
    } else if (kind.startsWith('T:')) {
      const items = Array.isArray(raw) ? raw.filter(isAeroTomlTable) : []
      if (!(omit === 'empty' && items.length === 0)) {
        view[key] = items.map((item) => viewTable(kind.slice(2), item))
      }
    } else if (!(omit === 'absent' && raw === undefined)) {
      const value = scalarOf(kind, raw)
      if (!(omit === 'empty' && isEmpty(value))) {
        view[key] = value
      }
    }
  }
  if (source !== undefined) {
    const known = new Set(fields.map(([key]) => key))
    for (const [key, value] of Object.entries(source)) {
      if (!known.has(key)) {
        view[key] = aeroTomlToJson(value)
      }
    }
  }
  return view
}

/** An attachment's absolute path under the data directory, only while it stays inside it. */
function attachmentLocation(dataDirectory: string, path: string): string | undefined {
  const target = resolve(dataDirectory, path)
  const outside = relative(dataDirectory, target)
  return path === '' || outside.startsWith('..') || isAbsolute(outside) ? undefined : target
}

/** The computed `readiness.stale` and `gate_approved`, true only while they hold (kanban.rs). */
function withReadinessFlags(card: AeroTomlTable, readiness: AeroTomlTable): AeroTomlTable {
  const hash = aeroKanbanCardTextHash(card)
  const judged = readString(readiness, 'text_hash')
  const current = judged !== '' && judged === hash
  const approval = readString(readiness, 'gate_approved_hash')
  return {
    ...readiness,
    stale: !current,
    gate_approved:
      readString(readiness, 'verdict') === 'ready-with-plan-gate' &&
      current &&
      approval !== '' &&
      approval === hash
  }
}

function withComputedFields(card: AeroTomlTable, dataDirectory: string): AeroTomlTable {
  const view: AeroTomlTable = { ...card }
  if (isAeroTomlTable(card.readiness)) {
    view.readiness = withReadinessFlags(card, card.readiness)
  }
  view.attachments = readTables(card, 'attachments').map((attachment) => {
    const abs = attachmentLocation(dataDirectory, readString(attachment, 'path'))
    return abs === undefined ? attachment : { ...attachment, abs }
  })
  return view
}

/**
 * The board as the `kanban_*` tools print it: kanban.rs's serde shape, with an attachment's `abs`
 * and the readiness `stale` and `gate_approved` flags filled like Aero's agent view. Keys this
 * reader does not know are kept after the known ones.
 */
export function viewAeroKanbanBoard(tree: AeroTomlTable, dataDirectory: string): AeroKanbanJson {
  const prepared: AeroTomlTable = {
    ...tree,
    mode: Object.hasOwn(tree, 'mode') ? tree.mode : 'monolith',
    card: readTables(tree, 'card').map((card) => withComputedFields(card, dataDirectory))
  }
  return viewTable('board', prepared)
}
