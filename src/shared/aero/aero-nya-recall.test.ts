import { describe, expect, it } from 'vitest'
import { buildAeroNyaRecallTerms, recallAeroNyaScars } from './aero-nya-recall'
import { makeAeroNyaScar } from './aero-nya-test-scars'

const occurrence = { occurred_at: '2026-07-24T19:32:13Z', recorded_by: 'git:dev@example.com' }

const STOP = makeAeroNyaScar({
  id: 'NYA-STOP',
  title: 'Codex stop must interrupt the running turn',
  lesson: 'Stopping a Codex session has to kill the child process, not only flag the UI.',
  scope: ['src-tauri/src/codex.rs'],
  tags: ['codex', 'interrupt']
})
const BACKEND = makeAeroNyaScar({
  id: 'NYA-BACKEND',
  title: 'Backend commands need registering',
  lesson: 'A new command is inert until main registers it in the handler list.',
  scope: ['src-tauri/src/**'],
  tags: ['backend']
})
const UI = makeAeroNyaScar({
  id: 'NYA-UI',
  title: 'UI strings stay in English',
  lesson: 'Interface text is English; translate nothing in components.',
  scope: ['src/**'],
  tags: ['ui']
})
const GLOBAL = makeAeroNyaScar({
  id: 'NYA-GLOBAL',
  title: 'Never guess a remote URL',
  lesson: 'Read the git remote instead of typing an organisation from memory.',
  scope: ['**'],
  tags: ['docs'],
  occurrences: [occurrence, occurrence, occurrence]
})
const SCARS = [STOP, BACKEND, UI, GLOBAL]

const recall = (task: string, paths: string[], limit?: number): string[] =>
  recallAeroNyaScars(SCARS, { task, paths, limit }).map((scar) => scar.id)

describe('buildAeroNyaRecallTerms', () => {
  it('splits paths then the task into lowercase words, dropping one-byte words and repeats', () => {
    expect(buildAeroNyaRecallTerms('Fix the Codex stop a bug', ['src-tauri/src/codex.rs'])).toEqual(
      ['src', 'tauri', 'codex', 'rs', 'fix', 'the', 'stop', 'bug']
    )
  })

  it('keeps at most 128 distinct terms', () => {
    const words = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ')
    expect(buildAeroNyaRecallTerms(words, [])).toHaveLength(128)
  })

  it('counts a one-character word of another script as long enough, like a byte length', () => {
    expect(buildAeroNyaRecallTerms('ç x', [])).toEqual(['ç'])
  })
})

describe('recallAeroNyaScars', () => {
  it('puts a scar that is both in scope and text-relevant first', () => {
    expect(recall('fix codex stop handling', ['src-tauri/src/codex.rs'])[0]).toBe('NYA-STOP')
  })

  it('orders scoped and matched, then matched only, then scoped only', () => {
    expect(recall('codex backend', ['src-tauri/src/codex.rs'])).toEqual([
      'NYA-STOP',
      'NYA-BACKEND',
      'NYA-UI',
      'NYA-GLOBAL'
    ])
  })

  it('returns a scoped scar even when no word of the task matches it', () => {
    expect(recall('zzz', ['lib/x.ts'])).toEqual(['NYA-GLOBAL'])
  })

  it('leaves out a scar that is neither in scope nor text-relevant', () => {
    expect(recall('codex', ['docs/readme.md'])).toEqual(['NYA-GLOBAL', 'NYA-STOP'])
  })

  it('matches a term as a prefix of a word, never the other way round', () => {
    expect(recall('interr', [])).toContain('NYA-STOP')
    expect(recall('interrupting', [])).not.toContain('NYA-STOP')
  })

  it('breaks a tie between scoped-only scars by the number of occurrences', () => {
    const quiet = makeAeroNyaScar({ id: 'NYA-QUIET', scope: ['[a-z]/**'] })
    const busy = makeAeroNyaScar({
      id: 'NYA-BUSY',
      scope: ['[a-z]/**'],
      occurrences: [occurrence, occurrence]
    })
    const ids = recallAeroNyaScars([quiet, busy], { task: '', paths: ['a/file.txt'] }).map(
      (scar) => scar.id
    )
    expect(ids).toEqual(['NYA-BUSY', 'NYA-QUIET'])
  })

  it('ranks a short matching title above a long lesson mentioning the word once', () => {
    const long = makeAeroNyaScar({
      id: 'NYA-LONG',
      title: 'Release notes',
      lesson: `${'filler words about unrelated work '.repeat(20)} sentinel ${'more filler '.repeat(20)}`
    })
    const short = makeAeroNyaScar({ id: 'NYA-SHORT', title: 'Sentinel', lesson: 'Short.' })
    const ids = recallAeroNyaScars([long, short], { task: 'sentinel', paths: [] }).map(
      (scar) => scar.id
    )
    expect(ids).toEqual(['NYA-SHORT', 'NYA-LONG'])
  })

  it('returns every scar when there is nothing to search with, most recurrent first', () => {
    expect(recall('', [])).toEqual(['NYA-GLOBAL', 'NYA-STOP', 'NYA-BACKEND', 'NYA-UI'])
  })

  it('truncates to the limit, 12 by default', () => {
    expect(recall('', [], 2)).toHaveLength(2)
    const many = Array.from({ length: 20 }, (_, index) => makeAeroNyaScar({ id: `NYA-${index}` }))
    expect(recallAeroNyaScars(many, { task: '', paths: [] })).toHaveLength(12)
  })

  it('reads backslash paths as slash paths', () => {
    expect(recall('', ['src-tauri\\src\\codex.rs'])).toEqual(
      expect.arrayContaining(['NYA-STOP', 'NYA-BACKEND'])
    )
  })
})
