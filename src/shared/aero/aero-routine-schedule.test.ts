import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAeroRoutine } from './aero-prompt-definitions'
import { parseAeroRoutineSchedule } from './aero-routine-schedule'

describe('parseAeroRoutineSchedule', () => {
  it.each([
    ['weekly seg 09:00', { kind: 'weekly', weekday: 'mon', time: '09:00' }],
    ['weekly sun 04:00', { kind: 'weekly', weekday: 'sun', time: '04:00' }],
    ['Weekly Sáb 7:30', { kind: 'weekly', weekday: 'sat', time: '07:30' }],
    ['weekly quarta 23:59', { kind: 'weekly', weekday: 'wed', time: '23:59' }],
    ['daily 08:00', { kind: 'daily', time: '08:00' }],
    ['every 6h', { kind: 'every', minutes: 360 }],
    ['every 30m', { kind: 'every', minutes: 30 }],
    ['every 2d', { kind: 'every', minutes: 2880 }]
  ])('understands %s', (raw, expected) => {
    expect(parseAeroRoutineSchedule(raw)).toEqual({ ok: true, value: expected })
  })

  it.each([
    'hourly',
    'every h',
    'every 6x',
    'every 6 h',
    'daily 24:00',
    'daily 08:60',
    'daily 8h',
    'weekly xyz 09:00',
    'weekly seg',
    'weekly seg 09:00 extra',
    ''
  ])('rejects %j', (raw) => {
    const result = parseAeroRoutineSchedule(raw)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.issues[0]).toContain('unsupported schedule')
  })
})

describe('parseAeroRoutine', () => {
  it('reads the frontmatter lists, the full flag and the mission body', () => {
    const raw = readFileSync(join(import.meta.dirname, '__fixtures__', 'routine-weekly.md'), 'utf8')
    expect(parseAeroRoutine(raw, 'Manutencao')).toEqual({
      name: 'manutencao',
      description: 'Weekly network maintenance — revalidates or flags stale knowledge',
      model: 'claude-sonnet-5-5',
      schedule: 'weekly seg 09:00',
      parsedSchedule: { kind: 'weekly', weekday: 'mon', time: '09:00' },
      scheduleIssue: null,
      slugs: ['arch', 'geral'],
      skills: ['pipeline-run'],
      loops: [],
      agents: [],
      full: true,
      mission:
        "You are this workspace's maintenance routine.\n\n1. Query the network and identify items marked VENCIDO."
    })
  })

  it('keeps a routine whose schedule is invalid and reports why', () => {
    const routine = parseAeroRoutine('---\nschedule: whenever\n---\nGo', 'r')
    expect(routine.parsedSchedule).toBeNull()
    expect(routine.scheduleIssue).toContain('unsupported schedule "whenever"')
  })

  it('treats a file without frontmatter as pure mission', () => {
    expect(parseAeroRoutine('Just do it\n', 'plain')).toMatchObject({
      schedule: '',
      scheduleIssue: null,
      mission: 'Just do it'
    })
  })
})
