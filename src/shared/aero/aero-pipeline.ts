import { z } from 'zod'
import { aeroFailure, type AeroParseResult } from './aero-parse-result'
import { parseAeroTomlDocument } from './aero-toml-document'

// Shallow on purpose: pipeline.rs tolerates unknown keys (dropped here), so only the identifying
// fields and the ones `validate_sensors` looks at are read.
const text = z.string().default('')

const AeroPipelineSensorSchema = z.object({
  id: z.string(),
  tool: z.string().optional(),
  match: z.string().optional(),
  // ok | ran | fail; an unknown value keeps meaning ok
  expect: z.string().optional(),
  same_cmd_as: z.string().optional()
})

const AeroPipelineDefFileSchema = z.object({
  name: text,
  description: text,
  phase: z
    .array(
      z.object({
        id: z.string(),
        title: text,
        // skill:<id> | agent:<name> | critic | self
        executor: z.string().optional(),
        // doctor | critic | human
        gate: z.string().optional(),
        sensor: z.array(AeroPipelineSensorSchema).default([])
      })
    )
    .default([]),
  bundles: z
    .object({
      agents: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([]),
      loops: z.array(z.string()).default([])
    })
    .prefault({})
})

const AeroPipelineRunFileSchema = z.object({
  run: z.object({ id: text, name: text, intent: text, phase: text, status: text }).prefault({}),
  phase: z.array(z.object({ id: z.string(), status: text })).default([])
})

const AeroPipelineAttestFileSchema = z.object({
  run_id: text,
  owner: text,
  def_name: text,
  attest: z
    .array(z.object({ phase: text, sensor: text, ok: z.boolean().default(false) }))
    .default([])
})

type AeroPipelineDefFile = z.infer<typeof AeroPipelineDefFileSchema>
type AeroPipelineSensorFile = z.infer<typeof AeroPipelineSensorSchema>

export type AeroPipelineDef = {
  name: string
  description: string
  phases: { id: string; title: string; executor: string | null; gate: string | null }[]
  sensorCount: number
  bundles: { agents: string[]; skills: string[]; loops: string[] }
}

export type AeroPipelineRun = {
  id: string
  name: string
  intent: string
  phase: string
  status: string
  phaseStatuses: { id: string; status: string }[]
}

export type AeroPipelineAttestation = {
  runId: string
  owner: string
  defName: string
  attested: number
  passed: number
}

/** pipeline.rs `validate_sensors`: the shape rules of the proof sensors; the reason, or null when fine. */
function validateSensors(def: AeroPipelineDefFile): string | null {
  const flat: { phaseId: string; sensor: AeroPipelineSensorFile }[] = def.phase.flatMap((phase) =>
    phase.sensor.map((sensor) => ({ phaseId: phase.id, sensor }))
  )
  for (const [index, { phaseId, sensor }] of flat.entries()) {
    const at = `${phaseId}/${sensor.id}`
    const isProof = sensor.expect === 'fail' || sensor.same_cmd_as !== undefined
    if (isProof && (sensor.tool !== undefined || sensor.match !== undefined)) {
      return `sensor ${at}: expect="fail"/same_cmd_as are active-only — drop \`tool\`/\`match\``
    }
    const reference = sensor.same_cmd_as
    if (reference === undefined) {
      continue
    }
    const dot = reference.indexOf('.')
    if (dot === -1) {
      return `sensor ${at}: same_cmd_as \`${reference}\` must be "<phase>.<sensor>"`
    }
    const [referencePhase, referenceSensor] = [reference.slice(0, dot), reference.slice(dot + 1)]
    const earlier = flat
      .slice(0, index)
      .some(
        (entry) =>
          entry.phaseId === referencePhase &&
          entry.sensor.id === referenceSensor &&
          entry.sensor.expect === 'fail'
      )
    if (!earlier) {
      return `sensor ${at}: same_cmd_as \`${reference}\` must name an EARLIER expect="fail" sensor of this def`
    }
  }
  return null
}

/**
 * A def's name falls back to the file stem, like pipeline.rs `scan_pipelines`. That scan also never
 * loads a def whose proof sensors are malformed, so such a def fails here and shows up as an issue.
 */
export function parseAeroPipelineDef(
  raw: string,
  fileStem: string
): AeroParseResult<AeroPipelineDef> {
  const parsed = parseAeroTomlDocument(raw, AeroPipelineDefFileSchema)
  if (!parsed.ok) {
    return parsed
  }
  const def = parsed.value
  const sensorProblem = validateSensors(def)
  if (sensorProblem !== null) {
    return aeroFailure(`pipeline def not loaded: ${sensorProblem}`)
  }
  return {
    ok: true,
    value: {
      name: def.name || fileStem,
      description: def.description,
      phases: def.phase.map((phase) => ({
        id: phase.id,
        title: phase.title,
        executor: phase.executor ?? null,
        gate: phase.gate ?? null
      })),
      sensorCount: def.phase.reduce((total, phase) => total + phase.sensor.length, 0),
      bundles: def.bundles
    }
  }
}

/** `.aerofortress/pipeline.toml`: the one active run, an instance of a def. */
export function parseAeroPipelineRun(raw: string): AeroParseResult<AeroPipelineRun> {
  const parsed = parseAeroTomlDocument(raw, AeroPipelineRunFileSchema)
  if (!parsed.ok) {
    return parsed
  }
  const { run, phase } = parsed.value
  return {
    ok: true,
    value: { ...run, phaseStatuses: phase.map(({ id, status }) => ({ id, status })) }
  }
}

/** `.aerofortress/pipeline.attest.toml`: the harness-written proof ledger of the active run. */
export function parseAeroPipelineAttestation(
  raw: string
): AeroParseResult<AeroPipelineAttestation> {
  const parsed = parseAeroTomlDocument(raw, AeroPipelineAttestFileSchema)
  if (!parsed.ok) {
    return parsed
  }
  const file = parsed.value
  return {
    ok: true,
    value: {
      runId: file.run_id,
      owner: file.owner,
      defName: file.def_name,
      attested: file.attest.length,
      passed: file.attest.filter((entry) => entry.ok).length
    }
  }
}
