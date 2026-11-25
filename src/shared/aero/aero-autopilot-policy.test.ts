import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { absentAeroAutopilotReading, parseAeroAutopilotPolicy } from './aero-autopilot-policy'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

describe('parseAeroAutopilotPolicy', () => {
  it('accepts a real policy, normalizes enum-like values and fills defaults', () => {
    const reading = parseAeroAutopilotPolicy(fixture('autopilot-policy-merge.toml'))
    expect(reading).toMatchObject({
      fileExists: true,
      level: 'merge',
      declaredLevel: 'merge',
      valid: true,
      errors: []
    })
    expect(reading.policy.trusted_authors).toEqual(['octo-cat'])
    expect(reading.policy.merge.strategy).toBe('squash')
    expect(reading.policy.merge.ci_timeout_min).toBe(60)
    expect(reading.policy.deploy).toEqual({ command: '', require_approval: true, timeout_min: 30 })
    expect(reading.policy.suggest.max_per_day).toBe(3)
  })

  it('treats an unknown key as an error and stays off', () => {
    const reading = parseAeroAutopilotPolicy('level = "merge"\nlevl = "deploy"\n')
    expect(reading.level).toBe('off')
    expect(reading.valid).toBe(false)
    expect(reading.errors).toHaveLength(1)
    expect(reading.errors[0]).toContain('autopilot.toml does not parse')
    expect(reading.errors[0]).toContain('levl')
    expect(reading.errors[0]).toContain('Autopilot stays off until it is fixed.')
  })

  it('rejects an unknown key nested in a table too', () => {
    expect(parseAeroAutopilotPolicy('[deploy]\ncommand = ""\nowner = "x"\n').level).toBe('off')
  })

  it('reports absent as level pr (no ceiling) with the declared level off', () => {
    expect(absentAeroAutopilotReading()).toMatchObject({
      fileExists: false,
      level: 'pr',
      declaredLevel: 'off',
      valid: true,
      errors: []
    })
  })

  it('fails closed with the exact validation messages', () => {
    const reading = parseAeroAutopilotPolicy(
      'level = "deploy"\nmax_parallel = 9\n[merge]\nstrategy = "fast-forward"\n'
    )
    expect(reading.level).toBe('off')
    expect(reading.declaredLevel).toBe('deploy')
    expect(reading.errors).toEqual([
      'max_parallel must be between 1 and 8 (got 9)',
      "merge.strategy 'fast-forward' is unknown; use one of: merge, squash, rebase",
      "level 'deploy' requires deploy.command (an empty command means never deploy)"
    ])
  })

  it('rejects a decimal for an integer field like serde does, and stays off', () => {
    const decimal = parseAeroAutopilotPolicy('level = "pr"\nmax_parallel = 2.0\n')
    expect(decimal.level).toBe('off')
    expect(decimal.valid).toBe(false)
    expect(decimal.errors[0]).toContain('autopilot.toml does not parse')
    expect(decimal.errors[0]).toContain('max_parallel')
    expect(parseAeroAutopilotPolicy('level = "pr"\nmax_parallel = 2\n')).toMatchObject({
      level: 'pr',
      valid: true
    })
    expect(parseAeroAutopilotPolicy('level = "pr"\n[merge]\nci_timeout_min = 1e1\n').level).toBe(
      'off'
    )
  })

  it('defaults max_parallel to 3 like DEFAULT_MAX_PARALLEL', () => {
    expect(parseAeroAutopilotPolicy('board = "main"\n').policy.max_parallel).toBe(3)
  })

  it('treats broken TOML as off', () => {
    const reading = parseAeroAutopilotPolicy('level = ')
    expect(reading.level).toBe('off')
    expect(reading.errors[0]).toContain('does not parse')
  })

  it('defaults a file that omits the level to suggest', () => {
    expect(parseAeroAutopilotPolicy('board = "main"\n')).toMatchObject({
      level: 'suggest',
      valid: true
    })
  })
})
