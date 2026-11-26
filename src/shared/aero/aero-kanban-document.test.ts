import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addAeroKanbanCard,
  removeAeroKanbanCard,
  updateAeroKanbanCard
} from './aero-kanban-card-ops'
import { assertAeroKanbanRewriteSafe, parseAeroKanbanDocument } from './aero-kanban-document'
import { parseAeroAgentOutcome } from './aero-kanban-outcome'
import { aeroTomlToJson } from './aero-kanban-view'
import { readString, readTables } from './aero-kanban-tables'
import {
  isAeroTomlTable,
  renderAeroTomlDocument,
  type AeroTomlTable
} from './aero-toml-document-writer'
import { parseAeroToml } from './aero-toml-integers'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

const STAMP = '2026-11-26T12:00:00.123+00:00'

function tableOf(value: unknown): AeroTomlTable {
  if (!isAeroTomlTable(value)) {
    throw new Error('expected a TOML table')
  }
  return value
}

function cardWith(tree: AeroTomlTable, test: (card: AeroTomlTable) => boolean): AeroTomlTable {
  const card = readTables(tree, 'card').find(test)
  if (card === undefined) {
    throw new Error('no such card in the fixture')
  }
  return card
}

describe('a board edit', () => {
  it('changes the touched lines and nothing else of a real board', () => {
    const raw = fixture('kanban-real-autopilot-trimmed.toml')
    const document = parseAeroKanbanDocument(raw, 'autopilot')
    const target = cardWith(
      document.tree,
      (card) => card.spec !== undefined && card.outcome !== undefined
    )
    updateAeroKanbanCard(document, readString(target, 'id'), { priority: 'urgent' }, STAMP)

    const before = raw.split('\n')
    const after = renderAeroTomlDocument(document.tree).split('\n')
    expect(after).toHaveLength(before.length)
    const changed = after.filter((line, index) => line !== before[index])
    expect(changed).toEqual(['priority = "urgent"', `touched = "${STAMP}"`])
  })

  it('adds no field when an agent echoes a stored outcome with a new status', () => {
    // a real outcome Aero wrote without the optional `tokens` (an interrupted run reports none)
    const tree = tableOf(parseAeroToml(fixture('kanban-real-autopilot-trimmed.toml')))
    delete tableOf(cardWith(tree, (card) => card.outcome !== undefined).outcome).tokens
    const raw = renderAeroTomlDocument(tree)
    const document = parseAeroKanbanDocument(raw, 'autopilot')
    const target = cardWith(document.tree, (card) => card.outcome !== undefined)
    const echoed = tableOf(aeroTomlToJson(tableOf(target.outcome)))
    const outcome = parseAeroAgentOutcome({ ...echoed, status: 'reviewed' })
    updateAeroKanbanCard(document, readString(target, 'id'), { outcome }, STAMP)

    const before = raw.split('\n')
    const after = renderAeroTomlDocument(document.tree).split('\n')
    expect(after).toHaveLength(before.length)
    expect(after.filter((line, index) => line !== before[index])).toEqual([
      `touched = "${STAMP}"`,
      'status = "reviewed"'
    ])
  })

  it('keeps the keys and tables it does not know, where they were', () => {
    const tree = tableOf(parseAeroToml(fixture('kanban-real-autopilot-trimmed.toml')))
    const card = cardWith(tree, (entry) => entry.spec !== undefined)
    card.future_flag = true
    tableOf(card.spec).future_table = { depth: 2n, label: 'kept' }
    const raw = renderAeroTomlDocument(tree)

    const document = parseAeroKanbanDocument(raw, 'autopilot')
    updateAeroKanbanCard(document, readString(card, 'id'), { title: 'Renamed' }, STAMP)
    const text = renderAeroTomlDocument(document.tree)

    expect(text).toContain('future_flag = true\n')
    expect(text).toContain('[card.spec.future_table]\ndepth = 2\nlabel = "kept"\n')
    const linesAfter = (source: string, marker: string): string[] => {
      const lines = source.split('\n')
      return lines.slice(lines.indexOf(marker) + 1, lines.indexOf(marker) + 4)
    }
    expect(linesAfter(text, 'future_flag = true')).toEqual(linesAfter(raw, 'future_flag = true'))
    expect(linesAfter(text, '[card.spec.future_table]')).toEqual(
      linesAfter(raw, '[card.spec.future_table]')
    )
  })

  it('lays out the first card of an empty board after its columns, as Aero does', () => {
    const raw = fixture('kanban-rust-empty.toml')
    const document = parseAeroKanbanDocument(raw, 'empty')
    const id = addAeroKanbanCard(document, { title: 'First', desc: '', pipeline: '' }, STAMP)
    const text = renderAeroTomlDocument(document.tree)
    expect(text.slice(0, text.indexOf('[['))).toBe(
      'name = "empty"\nmode = "monolith"\npipeline = ""\n\n'
    )
    expect(text.indexOf('[[card]]')).toBeGreaterThan(text.lastIndexOf('[[column]]'))

    removeAeroKanbanCard(document, id)
    expect(renderAeroTomlDocument(document.tree)).toBe(raw)
  })
})

describe('assertAeroKanbanRewriteSafe', () => {
  const canonical = fixture('kanban-rust-empty.toml')

  it('accepts a board in the form Aero writes', () => {
    expect(() =>
      assertAeroKanbanRewriteSafe(canonical, parseAeroKanbanDocument(canonical, 'empty'))
    ).not.toThrow()
  })

  it.each([
    ['comments', `# my notes\n${canonical}`],
    ['CRLF line endings', canonical.replaceAll('\n', '\r\n')],
    ['a missing trailing newline', canonical.trimEnd()],
    ['loosely spaced keys', canonical.replace('mode = "monolith"', 'mode="monolith"')],
    ['an inline table', `${canonical}\n[column.extra]\nx = { a = 1 }\n`]
  ])('refuses a board with %s instead of normalising it', (_name, raw) => {
    const document = parseAeroKanbanDocument(raw, 'empty')
    expect(() => assertAeroKanbanRewriteSafe(raw, document)).toThrow(
      /refusing to rewrite|cannot be rewritten/
    )
  })
})
