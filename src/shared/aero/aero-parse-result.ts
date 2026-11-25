import type { ZodError } from 'zod'

export type AeroParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] }

export function aeroFailure(...issues: string[]): { ok: false; issues: string[] } {
  return { ok: false, issues }
}

export function describeZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
  )
}
