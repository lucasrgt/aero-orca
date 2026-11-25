import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAeroKanbanBoard } from './aero-kanban-board'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

describe('parseAeroKanbanBoard', () => {
  it('reads columns and every card field of a real autopilot board', () => {
    const result = parseAeroKanbanBoard(fixture('board-autopilot.toml'), 'autopilot')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const { value: board } = result
    expect(board.name).toBe('autopilot')
    expect(board.mode).toBe('monolith')
    expect(board.columns.map((column) => column.id)).toEqual(['backlog', 'done'])
    expect(board.cards.map((card) => card.id)).toEqual([
      'f1-live-quota-meter',
      'add-an-npm-test-script-that-runs-eaa56a'
    ])

    const [plain, delivered] = board.cards
    expect(plain).toMatchObject({
      priority: 'high',
      column: 'backlog',
      blocked_by: ['autonomy/f6-telegram-decision-desk'],
      suggested: false
    })
    expect(plain.readiness).toBeUndefined()
    expect(delivered.subtasks).toEqual([{ title: 'Document it in the README', done: true }])
    expect(delivered.split_hash).toBe('4960d280c0d71ce5')
    expect(delivered.readiness).toMatchObject({
      verdict: 'ready',
      score: 8,
      risk: 'low',
      estimate_min: 20
    })
    expect(delivered.readiness?.checks).toHaveLength(8)
    expect(delivered.spec?.acceptance).toEqual([
      {
        given: 'package.json has a scripts block without a test entry',
        when: 'the change is applied',
        // oxlint-disable-next-line unicorn/no-thenable -- Why: Aero's acceptance criteria are Given/When/Then.
        then: 'scripts.test runs cargo test'
      }
    ])
    expect(delivered.clarifications).toHaveLength(1)
    expect(delivered.clarifications[0]).toMatchObject({ id: 'q9baca1c5', answer: '' })
    expect(delivered.outcome).toMatchObject({
      status: 'pr-open',
      cost_usd: 0.22632030000000003,
      tokens: 40820,
      fully_proven: false,
      criteria: { pass: 0, fail: 1 },
      merge: { state: 'merged', pr_number: 58, strategy: 'merge' },
      evaluation: { action: 'merge', via: 'app' }
    })
    expect(delivered.outcome?.criteria_proof[0]).toMatchObject({ index: 1, status: 'unproven' })
  })

  it('names a board after its file and gives it the default columns when it has none', () => {
    const result = parseAeroKanbanBoard('[[card]]\nid = "c1"\n', 'roadmap')
    expect(result).toMatchObject({
      ok: true,
      value: { name: 'roadmap', mode: 'monolith', cards: [{ id: 'c1', title: '', column: '' }] }
    })
    expect(result.ok && result.value.columns.map((column) => column.id)).toEqual([
      'backlog',
      'doing',
      'review',
      'done',
      'blocked'
    ])
  })

  it('rejects a decimal in a count field and accepts an integer cost', () => {
    const decimal = parseAeroKanbanBoard('[[card]]\nid = "c"\n[card.readiness]\nscore = 2.0\n', 'x')
    expect(decimal.ok).toBe(false)
    const integers = parseAeroKanbanBoard(
      '[[card]]\nid = "c"\n[card.outcome]\ncost_usd = 1\ntokens = 5\n',
      'x'
    )
    expect(integers).toMatchObject({
      ok: true,
      value: { cards: [{ outcome: { cost_usd: 1, tokens: 5 } }] }
    })
  })

  it('accepts inf, -inf and nan in a cost like a Rust f64', () => {
    const cost = (literal: string): number | undefined => {
      const result = parseAeroKanbanBoard(
        `[[card]]
id = "c"
[card.outcome]
cost_usd = ${literal}
`,
        'x'
      )
      return result.ok ? result.value.cards[0]?.outcome?.cost_usd : undefined
    }
    expect(cost('inf')).toBe(Infinity)
    expect(cost('-inf')).toBe(-Infinity)
    expect(cost('nan')).toBeNaN()
    expect(cost('"text"')).toBeUndefined()
  })

  it('reports broken TOML and a card without an id as issues', () => {
    expect(parseAeroKanbanBoard('name = ', 'x').ok).toBe(false)
    const noId = parseAeroKanbanBoard('[[card]]\ntitle = "t"\n', 'x')
    expect(noId.ok).toBe(false)
    expect(!noId.ok && noId.issues[0]).toContain('card.0.id')
  })
})
