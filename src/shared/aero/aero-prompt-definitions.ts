import {
  readAeroFrontmatterFields,
  splitAeroCommaList,
  splitAeroFrontmatter
} from './aero-frontmatter'
import { parseAeroRoutineSchedule, type AeroRoutineSchedule } from './aero-routine-schedule'

// Routines, loops and agents share one file shape: optional frontmatter, then the prompt body.
// A file without frontmatter is all prompt, and every definition parses (parse_def never fails).

type AeroDefinitionHead = { name: string; description: string; model: string | null }

export type AeroRoutine = AeroDefinitionHead & {
  schedule: string
  /** null when the schedule is empty (manual only) or not in the grammar, so it never fires. */
  parsedSchedule: AeroRoutineSchedule | null
  scheduleIssue: string | null
  slugs: string[]
  skills: string[]
  loops: string[]
  agents: string[]
  full: boolean
  mission: string
}

export type AeroLoop = AeroDefinitionHead & {
  stop: string
  max: number
  slugs: string[]
  goal: string
}

export type AeroAgent = AeroDefinitionHead & {
  slugs: string[]
  persona: string
}

const AERO_LOOP_DEFAULT_MAX = 10
const AERO_LOOP_MAX_RANGE = { min: 1, max: 500 }
const AERO_U32_MAX = 4_294_967_295n
const TRUE_WORDS = new Set(['true', 'yes', '1', 'sim'])

function readDefinition(
  raw: string,
  fileStem: string
): { name: string; fields: Map<string, string>; body: string } {
  const split = splitAeroFrontmatter(raw)
  return {
    name: fileStem.toLowerCase(),
    fields: split ? readAeroFrontmatterFields(split.header) : new Map(),
    body: split ? split.body : raw.trim()
  }
}

export function parseAeroRoutine(raw: string, fileStem: string): AeroRoutine {
  const { name, fields, body } = readDefinition(raw, fileStem)
  const schedule = fields.get('schedule') ?? ''
  const parsed = schedule.length > 0 ? parseAeroRoutineSchedule(schedule) : null
  return {
    name,
    description: fields.get('description') ?? '',
    model: fields.get('model') || null,
    schedule,
    parsedSchedule: parsed?.ok ? parsed.value : null,
    scheduleIssue: parsed && !parsed.ok ? parsed.issues.join('; ') : null,
    slugs: splitAeroCommaList(fields.get('slugs') ?? ''),
    skills: splitAeroCommaList(fields.get('skills') ?? ''),
    loops: splitAeroCommaList(fields.get('loops') ?? ''),
    agents: splitAeroCommaList(fields.get('agents') ?? ''),
    full: TRUE_WORDS.has((fields.get('full') ?? '').toLowerCase()),
    mission: body
  }
}

/** loops.rs `v.parse::<u32>()`: a leading `+` is fine, a value past `u32` is not declared at all. */
function parseAeroLoopMax(value: string): number | null {
  if (!/^\+?\d+$/.test(value) || BigInt(value) > AERO_U32_MAX) {
    return null
  }
  return Number(value)
}

export function parseAeroLoop(raw: string, fileStem: string): AeroLoop {
  const { name, fields, body } = readDefinition(raw, fileStem)
  const declaredMax = parseAeroLoopMax(fields.get('max') ?? '')
  return {
    name,
    description: fields.get('description') ?? '',
    model: fields.get('model') || null,
    stop: fields.get('stop') ?? '',
    max:
      declaredMax === null
        ? AERO_LOOP_DEFAULT_MAX
        : Math.min(Math.max(declaredMax, AERO_LOOP_MAX_RANGE.min), AERO_LOOP_MAX_RANGE.max),
    slugs: splitAeroCommaList(fields.get('slugs') ?? ''),
    goal: body
  }
}

export function parseAeroAgent(raw: string, fileStem: string): AeroAgent {
  const { name, fields, body } = readDefinition(raw, fileStem)
  return {
    name,
    description: fields.get('description') ?? '',
    model: fields.get('model') || null,
    slugs: splitAeroCommaList(fields.get('slugs') ?? ''),
    persona: body
  }
}
