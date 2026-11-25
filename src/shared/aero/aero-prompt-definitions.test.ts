import { describe, expect, it } from 'vitest'
import { parseAeroLoop } from './aero-prompt-definitions'

const loop = (max: string): number => parseAeroLoop(`---\nmax: ${max}\n---\nGo`, 'l').max

describe('parseAeroLoop max', () => {
  it('clamps a declared u32 into 1..500', () => {
    expect(loop('0')).toBe(1)
    expect(loop('7')).toBe(7)
    expect(loop('+7')).toBe(7)
    expect(loop('9000')).toBe(500)
    expect(loop('4294967295')).toBe(500)
  })

  it('counts a value past u32, a negative or a decimal as not declared (default 10)', () => {
    expect(loop('4294967296')).toBe(10)
    expect(loop('99999999999999999999')).toBe(10)
    expect(loop('-3')).toBe(10)
    expect(loop('2.5')).toBe(10)
    expect(parseAeroLoop('no frontmatter', 'l').max).toBe(10)
  })
})
