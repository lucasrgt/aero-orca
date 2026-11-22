import { describe, expect, it } from 'vitest'
import {
  formatWarmSlotTurnNote,
  selectWarmSlotRecommendation,
  WARM_SLOT_RECYCLE_PERCENT,
  type WarmSlotWorker
} from './bot-warm-slot'

function slot(overrides: Partial<WarmSlotWorker> = {}): WarmSlotWorker {
  return {
    dispatchId: 'disp_1',
    title: 'Viajantes map filter',
    agent: 'claude',
    state: 'completed',
    idle: false,
    workspaceName: 'viajantes-slot',
    branch: 'feat/viajantes',
    startedAt: 1000,
    contextPercent: 28,
    ...overrides
  }
}

describe('warm territory worker slots', () => {
  it('recommends reusing an idle/completed warm slot below the recycle threshold', () => {
    const note = formatWarmSlotTurnNote([slot({ contextPercent: 34 })], 'orca')
    expect(note).toContain('dispatch:disp_1')
    expect(note).toContain('context ~34%')
    expect(note).toContain('Reuse it for this territory task')
    expect(note).toContain('orca orchestration send --to dispatch:disp_1')
  })

  it('flags RECYCLE RECOMMENDED when the lightest warm slot reaches the recycle threshold', () => {
    const note = formatWarmSlotTurnNote(
      [slot({ dispatchId: 'disp_heavy', contextPercent: WARM_SLOT_RECYCLE_PERCENT })],
      'orca'
    )
    expect(note).toContain('RECYCLE RECOMMENDED')
    expect(note).toContain(`context ~${WARM_SLOT_RECYCLE_PERCENT}%`)
    expect(note).toContain('MEMORY.md')
  })

  it('picks the lightest reusable warm slot when several exist', () => {
    const pick = selectWarmSlotRecommendation([
      slot({ dispatchId: 'heavy', contextPercent: 81 }),
      slot({ dispatchId: 'light', contextPercent: 19, state: 'working', idle: true }),
      slot({ dispatchId: 'busy', state: 'working', idle: false, contextPercent: 10 })
    ])
    expect(pick).toMatchObject({
      kind: 'reuse',
      busyCount: 1,
      worker: { dispatchId: 'light' }
    })
  })

  it('reports busy when only actively running workers exist', () => {
    const note = formatWarmSlotTurnNote(
      [slot({ dispatchId: 'disp_busy', state: 'working', idle: false, contextPercent: 40 })],
      'orca'
    )
    expect(note).toContain('currently busy')
    expect(note).toContain('parallel worker slot')
  })

  it('ignores failed and stopped workers', () => {
    expect(
      formatWarmSlotTurnNote(
        [
          slot({ state: 'failed' }),
          slot({ dispatchId: 'disp_2', state: 'stopped' }),
          slot({ dispatchId: 'disp_3', state: 'unverifiable' })
        ],
        'orca'
      )
    ).toBeNull()
  })
})
