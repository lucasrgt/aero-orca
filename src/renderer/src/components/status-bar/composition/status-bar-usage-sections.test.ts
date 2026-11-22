import { describe, expect, it } from 'vitest'
import type {
  ProviderRateLimits,
  RateLimitWindow
} from '../../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { getStatusBarUsageSections } from './status-bar-usage-sections'

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0)
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

function win(usedPercent: number, windowMinutes: number, resetsInMs: number): RateLimitWindow {
  return {
    usedPercent,
    windowMinutes,
    resetsAt: NOW + resetsInMs,
    resetDescription: null
  }
}

function claude(overrides: Partial<ProviderRateLimits>): ProviderRateLimits {
  return {
    provider: 'claude',
    status: 'ok',
    error: null,
    updatedAt: NOW,
    session: null,
    weekly: null,
    ...overrides
  }
}

describe('getStatusBarUsageSections for Claude', () => {
  it('shows weekly (wk) instead of Fable in compact mode even when Fable or session is higher', () => {
    const sections = getStatusBarUsageSections(
      claude({
        session: win(62, 300, 3 * HOUR),
        weekly: win(33, 10_080, 4 * DAY),
        fableWeekly: win(100, 10_080, 4 * DAY)
      }),
      'compact'
    )

    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      key: 'headline',
      label: 'wk',
      window: { usedPercent: 33, windowMinutes: 10_080 }
    })
  })

  it('omits Fable and labels weekly as wk in verbose mode when primary windows exist', () => {
    const sections = getStatusBarUsageSections(
      claude({
        session: win(12, 300, 3 * HOUR),
        weekly: win(33, 10_080, 4 * DAY),
        fableWeekly: win(100, 10_080, 4 * DAY)
      }),
      'verbose'
    )

    expect(sections.map((section) => section.key)).toEqual(['session', 'weekly'])
    expect(sections[1]?.label).toBe('wk')
  })

  it('still falls back to Fable when no primary windows are present', () => {
    const sections = getStatusBarUsageSections(
      claude({
        fableWeekly: win(100, 10_080, 4 * DAY)
      }),
      'compact'
    )

    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      key: 'headline',
      label: 'Fable',
      window: { usedPercent: 100 }
    })
  })
})
