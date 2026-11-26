import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aeroKanbanCardTextHash } from './aero-kanban-text-hash'
import { parseAeroToml } from './aero-toml-integers'
import { readTables } from './aero-kanban-tables'
import { isAeroTomlTable, type AeroTomlTable } from './aero-toml-document-writer'

type Card = AeroTomlTable

// Computed by running kanban.rs's own `card_text_hash` (rustc 1.96) over the same cards.
const RUST_VECTORS: [string, Card, string][] = [
  [
    'title and desc',
    { title: 'Add a dark mode', desc: 'Follow the OS theme.' },
    'c8c2e8be7b29cd25'
  ],
  [
    'subtask titles',
    { title: 'T', desc: 'd', subtasks: [{ title: 'one' }, { title: 'two', done: true }] },
    'aaebaf8e226332b7'
  ],
  [
    'a spec the user edited',
    {
      title: 'T',
      desc: 'd',
      spec: {
        story: 'As a user, I want x.',
        edited: true,
        acceptance: [
          // oxlint-disable-next-line unicorn/no-thenable -- Why: Aero's criteria are Given/When/Then.
          { given: 'g1', when: 'w1', then: 't1' },
          // oxlint-disable-next-line unicorn/no-thenable -- Why: Aero's criteria are Given/When/Then.
          { given: 'g2', when: 'w2', then: 't2' }
        ]
      }
    },
    '703bb77c6330df76'
  ],
  [
    'a spec the model proposed',
    { title: 'T', desc: 'd', spec: { story: 'As a user, I want x.', edited: false } },
    'a55632f9b1738ebd'
  ],
  [
    'answered clarifications only',
    {
      title: 'T',
      desc: 'd',
      clarifications: [
        { question: 'Which pages?', answer: 'All of them' },
        { question: 'Open one?', answer: '  ' }
      ]
    },
    '2979ad7a156f22f4'
  ],
  [
    'unicode text and the whitespace Rust trims',
    { title: '\u0085 Café — ação　', desc: '﻿ünï ' },
    '4f82fff239a8ebbf'
  ]
]

// The text_hash a real triage stored on cards of AeroFortress's own board, untouched since.
const STORED_HASHES: [string, string][] = [
  ['i18n-rollout-translate-the-rest--ed4392', '4960d280c0d71ce5'],
  ['i18n-rollout-1-3-sidebar-tabs-co-3e4f56', '3e827e084e5c9e2a'],
  ['i18n-rollout-2-3-work-and-automa-e6f987', 'b4471a1164128aa2'],
  ['i18n-rollout-3-3-knowledge-obser-ddcc1f', 'eb6f9a97a47d4626'],
  ['i18n-sidebar-tabs-composer-and-c-03e3d2', '59ef0c257f8168a7']
]

describe('aeroKanbanCardTextHash', () => {
  it.each(RUST_VECTORS)('matches the Rust hash for %s', (_name, card, expected) => {
    expect(aeroKanbanCardTextHash(card)).toBe(expected)
  })

  it('matches the hash a real triage stored on the board', () => {
    const board = parseAeroToml(
      readFileSync(
        join(import.meta.dirname, '__fixtures__', 'kanban-real-autopilot-trimmed.toml'),
        'utf8'
      )
    )
    const cards = isAeroTomlTable(board) ? readTables(board, 'card') : []
    for (const [id, stored] of STORED_HASHES) {
      const card = cards.find((entry) => entry.id === id)
      expect(card, id).toBeDefined()
      expect(card === undefined ? '' : aeroKanbanCardTextHash(card), id).toBe(stored)
    }
  })
})
