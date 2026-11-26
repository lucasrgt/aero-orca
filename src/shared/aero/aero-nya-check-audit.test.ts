import { describe, expect, it } from 'vitest'
import { auditAeroNyaDiff, type AeroNyaJudge } from './aero-nya-check-audit'
import { makeAeroNyaScar } from './aero-nya-test-scars'

const SCAR = makeAeroNyaScar({ id: 'NYA-UI', title: 'UI is English', scope: ['src/**'] })
const UNRELATED = makeAeroNyaScar({ id: 'NYA-RUST', scope: ['src-tauri/**'] })
const BODY = [
  'diff --git a/src/App.tsx b/src/App.tsx',
  '--- a/src/App.tsx',
  '+++ b/src/App.tsx',
  '@@ -1 +1,2 @@',
  '+<h1>Configuracoes</h1>'
].join('\n')
const FINDING = {
  scar_id: 'NYA-UI',
  path: 'src/App.tsx',
  line: 2,
  evidence: '+<h1>Configuracoes</h1>',
  reason: 'Portuguese text'
}

const input = (judge: AeroNyaJudge, scars = [SCAR, UNRELATED], body = BODY) => ({
  scars,
  body,
  paths: ['src/App.tsx'],
  resolveJudge: async () => judge
})

const verdict = (findings: unknown[]): string => JSON.stringify({ findings })

describe('auditAeroNyaDiff', () => {
  it('passes an empty diff and a diff no scar covers without starting a judge', async () => {
    const never = async () => {
      throw new Error('judge must not start')
    }
    const empty = { ...input(never), body: '  \n' }
    expect(await auditAeroNyaDiff(empty)).toEqual({ passed: true, scars_checked: 0, findings: [] })
    const uncovered = { ...input(never, [UNRELATED]) }
    expect(await auditAeroNyaDiff(uncovered)).toEqual({
      passed: true,
      scars_checked: 0,
      findings: []
    })
  })

  it('fails when the judge proposes a recurrence and the independent check confirms it', async () => {
    const prompts: string[] = []
    const judge: AeroNyaJudge = async (prompt) => {
      prompts.push(prompt)
      return verdict([FINDING])
    }
    const result = await auditAeroNyaDiff(input(judge))
    expect(result).toEqual({ passed: false, scars_checked: 1, findings: [FINDING] })
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('You are a recurrence auditor.')
    expect(prompts[1]).toContain('Independently verify this proposal')
    expect(prompts[0]).not.toContain('NYA-RUST')
  })

  it('passes when the confirmation does not repeat the proposal', async () => {
    let calls = 0
    const judge: AeroNyaJudge = async () => verdict(++calls === 1 ? [FINDING] : [])
    expect(await auditAeroNyaDiff(input(judge))).toEqual({
      passed: true,
      scars_checked: 1,
      findings: []
    })
  })

  it('passes a clean diff after one judge call', async () => {
    let calls = 0
    const judge: AeroNyaJudge = async () => {
      calls += 1
      return verdict([])
    }
    expect((await auditAeroNyaDiff(input(judge))).passed).toBe(true)
    expect(calls).toBe(1)
  })

  it('throws, and so never passes, when the judge fails or answers garbage', async () => {
    const failing: AeroNyaJudge = async () => {
      throw new Error('judge timed out after 600 seconds')
    }
    await expect(auditAeroNyaDiff(input(failing))).rejects.toThrow('judge timed out')
    await expect(auditAeroNyaDiff(input(async () => 'Looks fine to me'))).rejects.toThrow(
      'judge returned malformed verdict JSON'
    )
  })

  it('throws when the judge cites evidence that is not in the diff', async () => {
    const invented = async () => verdict([{ ...FINDING, evidence: '+never added' }])
    await expect(auditAeroNyaDiff(input(invented))).rejects.toThrow(
      'judge evidence does not occur in the cited path'
    )
  })
})
