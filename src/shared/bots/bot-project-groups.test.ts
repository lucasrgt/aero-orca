import { describe, expect, it } from 'vitest'
import {
  BOT_PROJECT_GENERAL_KEY,
  botProjectCollapseKey,
  buildBotSidebarRows
} from './bot-project-groups'

type Entry =
  | { id: string; kind: 'bot'; bot: { project?: string | null } }
  | { id: string; kind: 'group' }

const bot = (id: string, project?: string | null): Entry => ({
  id,
  kind: 'bot',
  bot: { project }
})

describe('buildBotSidebarRows', () => {
  it('stays flat when no bot has a project or when groupBy is none', () => {
    const entries = [bot('a'), bot('b')]
    const flat = buildBotSidebarRows(entries, 'project', new Set())
    expect(flat.grouped).toBe(false)
    expect(flat.rows.map((r) => r.id)).toEqual(['a', 'b'])

    const disabled = buildBotSidebarRows([bot('a', 'Host Point'), bot('b')], 'none', new Set())
    expect(disabled.grouped).toBe(false)
    expect(disabled.rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('groups bots by project alphabetically (case-insensitive) and puts unassigned bots under General', () => {
    const entries: Entry[] = [
      bot('p1', 'Pauta Web'),
      bot('h1', 'Host Point'),
      bot('g1'),
      bot('h2', 'host point'),
      { id: 'room1', kind: 'group' }
    ]
    const result = buildBotSidebarRows(entries, 'project', new Set())
    expect(result.grouped).toBe(true)
    expect(
      result.rows.map((r) =>
        r.kind === 'project-header' ? `#${r.label ?? 'General'}(${r.count})` : r.id
      )
    ).toEqual(['#Host Point(2)', 'h1', 'h2', '#Pauta Web(1)', 'p1', '#General(2)', 'g1', 'room1'])
  })

  it('omits entries under collapsed project headers', () => {
    const entries: Entry[] = [bot('h1', 'Host Point'), bot('p1', 'Pauta Web'), bot('g1')]
    const collapsed = new Set([
      botProjectCollapseKey('host point'),
      botProjectCollapseKey(BOT_PROJECT_GENERAL_KEY)
    ])
    const result = buildBotSidebarRows(entries, 'project', collapsed)
    expect(result.rows.map((r) => r.id)).toEqual([
      'bot-project-header:host point',
      'bot-project-header:pauta web',
      'p1',
      `bot-project-header:${BOT_PROJECT_GENERAL_KEY}`
    ])
  })
})
