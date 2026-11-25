import { aeroFailure, type AeroParseResult } from './aero-parse-result'

export type AeroWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type AeroRoutineSchedule =
  | { kind: 'every'; minutes: number }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; weekday: AeroWeekday; time: string }

// routines.rs `parse_dow`: a token matches when it STARTS with a name, so `segunda` and `monday` work.
const WEEKDAY_PREFIXES: readonly (readonly [readonly string[], AeroWeekday])[] = [
  [['seg', 'mon'], 'mon'],
  [['ter', 'tue'], 'tue'],
  [['qua', 'wed'], 'wed'],
  [['qui', 'thu'], 'thu'],
  [['sex', 'fri'], 'fri'],
  [['sab', 'sáb', 'sat'], 'sat'],
  [['dom', 'sun'], 'sun']
]

const EVERY_UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 24 * 60 }

function parseTimeOfDay(token: string): string | null {
  const match = /^(\d+):(\d+)$/.exec(token)
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseWeekday(token: string): AeroWeekday | null {
  const found = WEEKDAY_PREFIXES.find(([prefixes]) =>
    prefixes.some((prefix) => token.startsWith(prefix))
  )
  return found ? found[1] : null
}

/** Grammar: `every <n>m|h|d`, `daily HH:MM`, `weekly <weekday> HH:MM` (case-insensitive). */
export function parseAeroRoutineSchedule(raw: string): AeroParseResult<AeroRoutineSchedule> {
  const parts = raw.trim().toLowerCase().split(/\s+/)
  const [head, first, second, ...extra] = parts
  const unsupported = aeroFailure(
    `unsupported schedule "${raw.trim()}"; use "every 30m|6h|2d", "daily 08:00" or "weekly seg 09:00"`
  )
  if (extra.length > 0) {
    return unsupported
  }
  if (head === 'every' && first !== undefined && second === undefined) {
    const unit = first.slice(-1)
    const amount = /^\d+$/.test(first.slice(0, -1)) ? Number(first.slice(0, -1)) : null
    const unitMinutes = EVERY_UNIT_MINUTES[unit]
    return amount !== null && unitMinutes !== undefined
      ? { ok: true, value: { kind: 'every', minutes: amount * unitMinutes } }
      : unsupported
  }
  if (head === 'daily' && first !== undefined && second === undefined) {
    const time = parseTimeOfDay(first)
    return time ? { ok: true, value: { kind: 'daily', time } } : unsupported
  }
  if (head === 'weekly' && first !== undefined && second !== undefined) {
    const weekday = parseWeekday(first)
    const time = parseTimeOfDay(second)
    return weekday && time ? { ok: true, value: { kind: 'weekly', weekday, time } } : unsupported
  }
  return unsupported
}
