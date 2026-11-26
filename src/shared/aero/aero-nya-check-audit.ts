import type { AeroNyaScar } from './aero-nya'
import { matchesAeroNyaScope } from './aero-nya-glob'
import { changedAeroNyaChunk, chunkAeroNyaDiff } from './aero-nya-diff-chunks'
import {
  AERO_NYA_FINDINGS_SCHEMA,
  buildAeroNyaAuditPrompt,
  buildAeroNyaVerifyPrompt,
  parseAeroNyaVerdict,
  sameAeroNyaFinding,
  validateAeroNyaFindings,
  withAeroNyaOutputSchema,
  type AeroNyaFinding
} from './aero-nya-judge'

const PATHS_PER_BATCH = 64
const SCARS_PER_BATCH = 24

/** Asks the isolated judge for one verdict: its stdout, which `parseAeroNyaVerdict` then reads. */
export type AeroNyaJudge = (prompt: string) => Promise<string>

export type AeroNyaCheckResult = {
  passed: boolean
  scars_checked: number
  findings: AeroNyaFinding[]
}

type PathScars = { path: string; scars: AeroNyaScar[] }

function inBatches<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size))
  }
  return batches
}

function scarsPerPath(scars: readonly AeroNyaScar[], paths: readonly string[]): PathScars[] {
  return paths.map((path) => ({
    path,
    scars: scars.filter((scar) => matchesAeroNyaScope(scar.scope, [path]))
  }))
}

function uniqueScars(batches: readonly PathScars[]): AeroNyaScar[] {
  const seen = new Set<string>()
  const unique: AeroNyaScar[] = []
  for (const { scars } of batches) {
    for (const scar of scars) {
      if (!seen.has(scar.id)) {
        seen.add(scar.id)
        unique.push(scar)
      }
    }
  }
  return unique
}

/** Paths that share the very same list of scars are audited together, one judge call per window. */
function groupPathsByScars(
  batches: readonly PathScars[]
): { paths: string[]; scars: AeroNyaScar[] }[] {
  const groups: { paths: string[]; scars: AeroNyaScar[] }[] = []
  for (const { path, scars } of batches) {
    const ids = scars.map((scar) => scar.id).join('\0')
    const group = groups.find(
      (candidate) => candidate.scars.map((scar) => scar.id).join('\0') === ids
    )
    if (group) {
      group.paths.push(path)
    } else if (scars.length > 0) {
      groups.push({ paths: [path], scars })
    }
  }
  return groups
}

async function askJudge(judge: AeroNyaJudge, prompt: string): Promise<AeroNyaFinding[]> {
  return parseAeroNyaVerdict(await judge(withAeroNyaOutputSchema(prompt, AERO_NYA_FINDINGS_SCHEMA)))
}

async function proposeFindings(
  judge: AeroNyaJudge,
  batches: readonly PathScars[],
  body: string
): Promise<AeroNyaFinding[]> {
  const proposed: AeroNyaFinding[] = []
  for (const group of groupPathsByScars(batches)) {
    for (const paths of inBatches(group.paths, PATHS_PER_BATCH)) {
      const patch = paths.map((path) => changedAeroNyaChunk(body, path)).join('\n')
      for (const diff of chunkAeroNyaDiff(patch)) {
        for (const scars of inBatches(group.scars, SCARS_PER_BATCH)) {
          const verdict = await askJudge(judge, buildAeroNyaAuditPrompt(scars, paths, diff))
          for (const finding of validateAeroNyaFindings(verdict, scars, paths, body)) {
            if (!proposed.some((known) => sameAeroNyaFinding(known, finding))) {
              proposed.push(finding)
            }
          }
        }
      }
    }
  }
  return proposed
}

async function confirmFinding(
  judge: AeroNyaJudge,
  finding: AeroNyaFinding,
  scar: AeroNyaScar,
  paths: readonly string[],
  body: string
): Promise<AeroNyaFinding | undefined> {
  const focused = chunkAeroNyaDiff(changedAeroNyaChunk(body, finding.path)).find((window) =>
    window.includes(finding.evidence)
  )
  if (focused === undefined) {
    throw new Error('finding evidence disappeared from diff chunks')
  }
  const verdict = await askJudge(judge, buildAeroNyaVerifyPrompt(scar, finding, focused))
  return validateAeroNyaFindings(verdict, [scar], paths, body).find(
    (value) => value.scar_id === finding.scar_id && value.path === finding.path
  )
}

/**
 * The recurrence audit: every changed path against the scars whose scope covers it, a proposal pass
 * and then an independent confirmation of each proposal. A judge failure throws, it never passes.
 * `resolveJudge` runs only once there is something to ask, so an empty diff needs no judge setup.
 */
export async function auditAeroNyaDiff(input: {
  scars: readonly AeroNyaScar[]
  body: string
  paths: readonly string[]
  resolveJudge: () => Promise<AeroNyaJudge>
}): Promise<AeroNyaCheckResult> {
  const { body, paths } = input
  if (body.trim() === '') {
    return { passed: true, scars_checked: 0, findings: [] }
  }
  const batches = scarsPerPath(input.scars, paths)
  const relevant = uniqueScars(batches)
  if (relevant.length === 0) {
    return { passed: true, scars_checked: 0, findings: [] }
  }
  const judge = await input.resolveJudge()
  const confirmed: AeroNyaFinding[] = []
  for (const finding of await proposeFindings(judge, batches, body)) {
    const scar = relevant.find((candidate) => candidate.id === finding.scar_id)
    if (scar === undefined) {
      throw new Error('scar disappeared')
    }
    const value = await confirmFinding(judge, finding, scar, paths, body)
    if (value && !confirmed.some((known) => sameAeroNyaFinding(known, value))) {
      confirmed.push(value)
    }
  }
  return { passed: confirmed.length === 0, scars_checked: relevant.length, findings: confirmed }
}
