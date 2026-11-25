import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAeroNyaConfig, parseAeroNyaScar } from './aero-nya'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

describe('parseAeroNyaScar', () => {
  it('reads a real scar with its occurrence', () => {
    const result = parseAeroNyaScar(fixture('nya-scar.toml'))
    expect(result).toMatchObject({
      ok: true,
      value: {
        schema: 1,
        id: 'NYA-01KYASTB1H12GS04SVR3CNF2M9',
        scope: ['**'],
        tags: ['aerofortress-migration', 'domain:arch'],
        created_at: '2026-07-24T19:32:13Z'
      }
    })
    expect(result.ok && result.value.occurrences).toEqual([
      {
        occurred_at: '2026-07-24T19:32:13Z',
        source: 'aerofortress-item:66e169ad-58a0-49e2-87dc-4f1e15541682',
        reported_by: 'harness:observation',
        corrected_by: 'git:dev@example.com',
        recorded_by: 'migration:aerofortress',
        commit: 'cd0fd26'
      }
    ])
  })

  it('rejects what not-you-again rejects: no scope, a bare actor, an unknown key', () => {
    const noScope = fixture('nya-scar.toml').replace('scope = ["**"]', 'scope = []')
    expect(parseAeroNyaScar(noScope)).toEqual({
      ok: false,
      issues: ['has no scope; add a specific glob or "**" for an explicitly global scar']
    })
    const bareActor = fixture('nya-scar.toml').replace('harness:observation', 'observation')
    expect(parseAeroNyaScar(bareActor)).toEqual({
      ok: false,
      issues: ['actor must be namespaced: observation']
    })
    const unknown = fixture('nya-scar.toml').replace('schema = 1', 'schema = 1\nseverity = "high"')
    expect(parseAeroNyaScar(unknown).ok).toBe(false)
  })
})

describe('integer fields', () => {
  it('rejects a decimal schema or timeout, which serde would not parse as an integer', () => {
    const decimalSchema = fixture('nya-scar.toml').replace('schema = 1', 'schema = 1.0')
    expect(parseAeroNyaScar(decimalSchema).ok).toBe(false)
    expect(parseAeroNyaConfig('schema = 1.0\n[check]\ntimeout_seconds = 600\n').ok).toBe(false)
    expect(parseAeroNyaConfig('schema = 1\n[check]\ntimeout_seconds = 600.0\n').ok).toBe(false)
  })
})

describe('parseAeroNyaConfig', () => {
  it('reads the check timeout', () => {
    expect(parseAeroNyaConfig('schema = 1\n\n[check]\ntimeout_seconds = 600\n')).toEqual({
      ok: true,
      value: { schema: 1, timeoutSeconds: 600 }
    })
  })
})
