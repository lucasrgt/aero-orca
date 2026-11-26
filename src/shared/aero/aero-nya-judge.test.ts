import { describe, expect, it } from 'vitest'
import {
  AERO_NYA_FINDINGS_SCHEMA,
  buildAeroNyaAuditPrompt,
  buildAeroNyaVerifyPrompt,
  parseAeroNyaVerdict,
  validateAeroNyaFindings,
  withAeroNyaOutputSchema,
  type AeroNyaFinding
} from './aero-nya-judge'
import { resolveAeroNyaJudgeSetup, substituteAeroNyaJudgeArgs } from './aero-nya-judge-command'
import { makeAeroNyaScar } from './aero-nya-test-scars'

const FINDING: AeroNyaFinding = {
  scar_id: 'NYA-UI',
  path: 'src/App.tsx',
  line: 3,
  evidence: '+  <h1>Configuracoes</h1>',
  reason: 'Portuguese interface text'
}

const SCAR = makeAeroNyaScar({ id: 'NYA-UI', title: 'UI is English', scope: ['src/**'] })

const DIFF = [
  'diff --git a/src/App.tsx b/src/App.tsx',
  '--- a/src/App.tsx',
  '+++ b/src/App.tsx',
  '@@ -1,2 +1,3 @@',
  ' export const App = () => (',
  '+  <h1>Configuracoes</h1>',
  ' )',
  'diff --git a/docs/notes.md b/docs/notes.md',
  '+only in the notes'
].join('\n')

describe('parseAeroNyaVerdict', () => {
  it('reads a verdict, surrounding whitespace included', () => {
    expect(parseAeroNyaVerdict(`\n${JSON.stringify({ findings: [FINDING] })}\n`)).toEqual([FINDING])
    expect(parseAeroNyaVerdict('{"findings":[]}')).toEqual([])
  })

  it('tolerates extra keys, as serde does without deny_unknown_fields', () => {
    expect(
      parseAeroNyaVerdict(JSON.stringify({ findings: [{ ...FINDING, extra: 1 }], note: 'x' }))
    ).toHaveLength(1)
  })

  it.each([
    ['empty output', ''],
    ['prose', 'No recurrence found.'],
    ['a markdown fence', '```json\n{"findings":[]}\n```'],
    ['truncated JSON', '{"findings":[{"scar_id":"NYA-UI"'],
    ['no findings key', '{}'],
    ['findings that is not an array', '{"findings":{}}'],
    ['a null document', 'null'],
    [
      'a finding without a reason',
      JSON.stringify({ findings: [{ ...FINDING, reason: undefined }] })
    ],
    ['a decimal line', JSON.stringify({ findings: [{ ...FINDING, line: 1.5 }] })],
    ['a negative line', JSON.stringify({ findings: [{ ...FINDING, line: -1 }] })],
    ['a line past u32', JSON.stringify({ findings: [{ ...FINDING, line: 4_294_967_296 }] })],
    ['a string line', JSON.stringify({ findings: [{ ...FINDING, line: '3' }] })]
  ])('treats %s as a malformed verdict, never as a pass', (_label, output) => {
    expect(() => parseAeroNyaVerdict(output)).toThrow('judge returned malformed verdict JSON')
  })
})

describe('validateAeroNyaFindings', () => {
  it('accepts a finding whose evidence occurs in the patch of its own path', () => {
    expect(validateAeroNyaFindings([FINDING], [SCAR], ['src/App.tsx'], DIFF)).toEqual([FINDING])
  })

  it.each([
    ['an unknown scar', { ...FINDING, scar_id: 'NYA-OTHER' }, 'judge referenced an unknown scar'],
    [
      'an unchanged path',
      { ...FINDING, path: 'src/other.ts' },
      'judge referenced an unchanged path `src/other.ts`'
    ],
    ['line 0', { ...FINDING, line: 0 }, 'judge returned an incomplete finding'],
    ['blank evidence', { ...FINDING, evidence: '  ' }, 'judge returned an incomplete finding'],
    [
      'paraphrased evidence',
      { ...FINDING, evidence: '+  <h1>Settings</h1>' },
      'judge evidence does not occur in the cited path'
    ]
  ])('rejects %s', (_label, finding, message) => {
    expect(() => validateAeroNyaFindings([finding], [SCAR], ['src/App.tsx'], DIFF)).toThrow(message)
  })

  it('rejects a scar applied to a path outside its scope', () => {
    const docs = { ...FINDING, path: 'docs/notes.md', evidence: '+only in the notes' }
    expect(() => validateAeroNyaFindings([docs], [SCAR], ['docs/notes.md'], DIFF)).toThrow(
      'judge referenced a scar outside its scope'
    )
  })

  it('rejects evidence that exists only in the patch of another file', () => {
    const wrongFile = makeAeroNyaScar({ id: 'NYA-ALL', scope: ['**'] })
    const finding = { ...FINDING, scar_id: 'NYA-ALL', path: 'docs/notes.md' }
    expect(() => validateAeroNyaFindings([finding], [wrongFile], ['docs/notes.md'], DIFF)).toThrow(
      'judge evidence does not occur in the cited path'
    )
  })
})

describe('prompts and schema', () => {
  it('asks for exactly the findings schema and appends it after the task', () => {
    const prompt = withAeroNyaOutputSchema('TASK', AERO_NYA_FINDINGS_SCHEMA)
    expect(prompt.startsWith('TASK\n<OUTPUT_SCHEMA>\n{')).toBe(true)
    expect(prompt.endsWith('}\n</OUTPUT_SCHEMA>')).toBe(true)
    expect(AERO_NYA_FINDINGS_SCHEMA).toMatchObject({
      required: ['findings'],
      additionalProperties: false
    })
  })

  it('frames the audit with delimited paths, scars (null for unset fields) and diff', () => {
    const prompt = buildAeroNyaAuditPrompt([SCAR], ['src/App.tsx'], 'THE DIFF')
    expect(prompt).toContain('You are a recurrence auditor.')
    expect(prompt).toContain('<PATHS>["src/App.tsx"]</PATHS>')
    expect(prompt).toContain('<SCARS>\n[\n  {\n    "schema": 1,\n    "id": "NYA-UI"')
    expect(prompt).toContain('"source": null')
    expect(prompt.endsWith('<DIFF>\nTHE DIFF\n</DIFF>')).toBe(true)
  })

  it('frames the confirmation with the one scar, the proposal in serde order and the focused diff', () => {
    const shuffled = { reason: 'r', line: 3, path: 'p', evidence: 'e', scar_id: 'NYA-UI' }
    const prompt = buildAeroNyaVerifyPrompt(SCAR, shuffled, 'FOCUSED')
    expect(prompt).toContain(
      '<PROPOSED>\n{"scar_id":"NYA-UI","path":"p","line":3,"evidence":"e","reason":"r"}\n</PROPOSED>'
    )
    expect(prompt.endsWith('<DIFF>\nFOCUSED\n</DIFF>')).toBe(true)
  })
})

describe('judge command', () => {
  it('runs claude with no tools, no session and the schema inline', () => {
    const setup = resolveAeroNyaJudgeSetup({ schema: 1, judge: 'claude', command: [] })
    expect(setup).toMatchObject({ isolateHome: false, externalOnly: false })
    expect(setup.command).toEqual([
      'claude',
      '--safe-mode',
      '--tools',
      '',
      '--no-session-persistence',
      '-p',
      '--json-schema',
      '{schema_json}'
    ])
    expect(substituteAeroNyaJudgeArgs(setup.command, '/tmp/s.json', '{"a":1}').at(-1)).toBe(
      '{"a":1}'
    )
  })

  it('runs codex read-only with an isolated home and the schema as a file', () => {
    const setup = resolveAeroNyaJudgeSetup({ schema: 1, judge: 'codex', command: [] })
    expect(setup).toMatchObject({ isolateHome: true, externalOnly: true })
    expect(setup.command).toContain('read-only')
    expect(substituteAeroNyaJudgeArgs(setup.command, '/tmp/s.json', '{}')).toContain('/tmp/s.json')
  })

  it('takes a configured command as is and refuses a judge with no command', () => {
    const custom = resolveAeroNyaJudgeSetup({
      schema: 1,
      judge: 'claude',
      command: ['my-judge', '-x']
    })
    expect(custom.command).toEqual(['my-judge', '-x'])
    expect(() => resolveAeroNyaJudgeSetup({ schema: 1, judge: 'unknown', command: [] })).toThrow(
      'judge `unknown` has no command'
    )
    expect(() => resolveAeroNyaJudgeSetup({ schema: 1, judge: 'toString', command: [] })).toThrow(
      'has no command'
    )
  })
})
