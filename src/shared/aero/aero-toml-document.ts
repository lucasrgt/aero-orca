import type { ZodType } from 'zod'
import { aeroFailure, describeZodIssues, type AeroParseResult } from './aero-parse-result'
import { parseAeroToml } from './aero-toml-integers'

/** Parses TOML text and validates the document against a schema, reporting failures as issues. */
export function parseAeroTomlDocument<T>(raw: string, schema: ZodType<T>): AeroParseResult<T> {
  let document: unknown
  try {
    document = parseAeroToml(raw)
  } catch (error) {
    return aeroFailure(`invalid TOML: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = schema.safeParse(document)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : aeroFailure(...describeZodIssues(parsed.error))
}
