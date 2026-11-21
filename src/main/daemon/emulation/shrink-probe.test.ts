// TEMPORARY measurement probe (not for merge): warm live-screen projection cost per read, unshrunk vs 121->120 shrink.
import { describe, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { HeadlessEmulator } from './headless-emulator'
import { projectTerminalVisibleLines } from './terminal-screen-projection'

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function grid(shrink: boolean): Promise<HeadlessEmulator> {
  const cols = shrink ? 121 : 120
  const e = new HeadlessEmulator({ cols, rows: 24, scrollback: 0 })
  let paint = '\x1b[?1049h\x1b[H'
  for (let r = 0; r < 23; r++) paint += `${`row ${r} `.padEnd(118, 'x')}\r\n`
  paint += '❯ draft text here'
  await e.write(paint)
  if (shrink) {
    e.resize(120, 24)
    // repaint so visible text fits but retained lines stay 121 wide
    let repaint = '\x1b[H'
    for (let r = 0; r < 23; r++) repaint += `${`row ${r} `.padEnd(118, 'y')}\r\n`
    repaint += '❯ draft text here'
    await e.write(repaint)
  }
  return e
}

describe('shrink projection probe', () => {
  it('measures warm projection per read', async () => {
    for (const shrink of [false, true]) {
      const e = await grid(shrink)
      for (let i = 0; i < 200; i++) projectTerminalVisibleLines(e)
      const rounds: number[] = []
      for (let round = 0; round < 7; round++) {
        const t: number[] = []
        for (let i = 0; i < 2000; i++) {
          const s = performance.now()
          projectTerminalVisibleLines(e)
          t.push(performance.now() - s)
        }
        rounds.push(median(t) * 1000)
      }
      console.log(`[shrink-probe] head shrink=${shrink} perReadMedianUs=${rounds.map((r) => r.toFixed(1)).join(',')}`)
      e.dispose()
    }
  }, 600_000)
})
