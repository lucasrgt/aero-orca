import { describe, expect, it } from 'vitest'
import {
  generateAeroUlid,
  parseAeroNyaReviewPermalink,
  readAeroNyaReviewComment,
  rememberAeroNyaScar,
  type AeroNyaRememberContext,
  type AeroNyaRememberRequest
} from './aero-nya-remember'
import { makeAeroNyaScar } from './aero-nya-test-scars'

const NOW = new Date('2026-11-25T22:15:30.123Z')
const CONTEXT: AeroNyaRememberContext = {
  now: NOW,
  actor: 'git:dev@example.com',
  commit: 'abc1234',
  newId: 'NYA-01KYASTB1H12GS04SVR3CNF2M9'
}
const NEW_SCAR: AeroNyaRememberRequest = {
  title: 'Guessed the org in a URL',
  lesson: 'Read the remote with git remote -v.',
  scope: ['**'],
  tags: ['docs']
}
const remember = (
  request: Partial<AeroNyaRememberRequest>,
  existing = [makeAeroNyaScar({ id: 'NYA-EXISTING', title: 'An  Existing   Title' })],
  context = CONTEXT
) => rememberAeroNyaScar(existing, { scope: [], tags: [], ...request }, context)

describe('generateAeroUlid', () => {
  it('writes a known ULID from its time and random bytes', () => {
    const random = Uint8Array.from([214, 118, 76, 97, 239, 185, 147, 2, 189, 91])
    expect(generateAeroUlid(1_469_918_176_385, random)).toBe('01ARYZ6S41TSV4RRFFQ69G5FAV')
  })

  it('is 26 Crockford characters', () => {
    expect(generateAeroUlid(NOW.getTime(), new Uint8Array(10).fill(255))).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{26}$/
    )
  })

  it('sorts by time and carries all 80 random bits', () => {
    const early = generateAeroUlid(1000, new Uint8Array(10).fill(255))
    const late = generateAeroUlid(1001, new Uint8Array(10))
    expect(early < late).toBe(true)
    expect(generateAeroUlid(0, new Uint8Array(10).fill(255)).slice(10)).toBe('Z'.repeat(16))
  })

  it('refuses the wrong amount of randomness', () => {
    expect(() => generateAeroUlid(0, new Uint8Array(9))).toThrow('10 random bytes')
  })
})

describe('rememberAeroNyaScar', () => {
  it('creates a scar with the generated id, the stamp in seconds and the inferred actors', () => {
    const { scar, created } = remember(NEW_SCAR)
    expect(created).toBe(true)
    expect(scar).toEqual({
      schema: 1,
      id: 'NYA-01KYASTB1H12GS04SVR3CNF2M9',
      title: 'Guessed the org in a URL',
      lesson: 'Read the remote with git remote -v.',
      scope: ['**'],
      tags: ['docs'],
      created_at: '2026-11-25T22:15:30Z',
      occurrences: [
        {
          occurred_at: '2026-11-25T22:15:30Z',
          corrected_by: 'git:dev@example.com',
          recorded_by: 'git:dev@example.com',
          commit: 'abc1234'
        }
      ]
    })
  })

  it('keeps explicit actors and a manual source over the inferred ones', () => {
    const { scar } = remember({
      ...NEW_SCAR,
      source: 'user report',
      reportedBy: 'user:dev',
      correctedBy: 'codex:openai',
      recordedBy: 'claude:anthropic'
    })
    expect(scar.occurrences[0]).toMatchObject({
      source: 'user report',
      reported_by: 'user:dev',
      corrected_by: 'codex:openai',
      recorded_by: 'claude:anthropic'
    })
  })

  it.each([
    ['no title', { lesson: 'x', scope: ['**'] }, '--title is required for a new scar'],
    [
      'a blank lesson',
      { title: 'x', lesson: '  ', scope: ['**'] },
      '--lesson is required for a new scar'
    ],
    ['no scope', { title: 'x', lesson: 'x' }, 'has no scope'],
    ['an invalid scope glob', { title: 'x', lesson: 'x', scope: ['a**'] }, 'invalid scope in'],
    ['a bare actor', { ...NEW_SCAR, correctedBy: 'someone' }, 'actor must be namespaced: someone']
  ])('refuses a new scar with %s', (_label, request, message) => {
    expect(() => remember(request)).toThrow(message)
  })

  it('appends an occurrence to the scar named by id, leaving its text alone', () => {
    const { scar, created } = remember({
      scar: 'NYA-EXISTING',
      title: 'ignored',
      lesson: 'ignored'
    })
    expect(created).toBe(false)
    expect(scar.title).toBe('An  Existing   Title')
    expect(scar.occurrences).toHaveLength(2)
    expect(scar.occurrences[1].occurred_at).toBe('2026-11-25T22:15:30Z')
  })

  it('appends to the scar whose title matches ignoring case and spacing', () => {
    const { scar, created } = remember({ title: 'an existing title' })
    expect(created).toBe(false)
    expect(scar.id).toBe('NYA-EXISTING')
  })

  it('fails on an id that does not exist even when a title would have created one', () => {
    expect(() => remember({ ...NEW_SCAR, scar: 'NYA-MISSING' })).toThrow(
      'scar NYA-MISSING was not found'
    )
  })

  it('takes the date, source and reporter of a review and refuses to mix them with manual ones', () => {
    const review = {
      htmlUrl: 'https://github.com/o/r/pull/1#discussion_r2',
      createdAt: '2026-11-01T10:00:00Z',
      login: 'reviewer'
    }
    const { scar } = remember({ ...NEW_SCAR, githubReview: review.htmlUrl }, [], {
      ...CONTEXT,
      review
    })
    expect(scar.occurrences[0]).toMatchObject({
      occurred_at: '2026-11-01T10:00:00Z',
      source: review.htmlUrl,
      reported_by: 'github:reviewer'
    })
    expect(() => remember({ ...NEW_SCAR, githubReview: review.htmlUrl, source: 'x' })).toThrow(
      'do not combine it with --source or --reported-by'
    )
  })
})

describe('parseAeroNyaReviewPermalink', () => {
  it('turns a pull request review permalink into the gh api call', () => {
    expect(parseAeroNyaReviewPermalink('https://github.com/o/r/pull/12#discussion_r345')).toEqual({
      hostname: 'github.com',
      endpoint: 'repos/o/r/pulls/comments/345'
    })
  })

  it.each([
    'https://github.com/o/r/pull/12',
    'http://github.com/o/r/pull/12#discussion_r1',
    'https://github.com/o/r/issues/12#discussion_r1',
    'https://github.com/o/r/pull/x#discussion_r1',
    'https://github.com/o/r/pull/12#discussion_rx',
    'https://github.com/o/r/pull/12/files#discussion_r1',
    'https://-oops/o/r/pull/12#discussion_r1',
    'https://evil.example/o/r/pull/12#discussion_r1',
    'https://github.com.evil.example/o/r/pull/12#discussion_r1',
    'https://github.example.com/o/r/pull/12#discussion_r1',
    'https://github.com/o/../pull/12#discussion_r1'
  ])('rejects %s', (url) => {
    expect(() => parseAeroNyaReviewPermalink(url)).toThrow()
  })
})

describe('readAeroNyaReviewComment', () => {
  const url = 'https://github.com/o/r/pull/12#discussion_r345'
  const json = (html_url = url) =>
    JSON.stringify({
      html_url,
      created_at: '2026-11-01T10:00:00Z',
      user: { login: 'reviewer' },
      body: 'ignored'
    })

  it('keeps only what an occurrence records', () => {
    expect(readAeroNyaReviewComment(json(), url)).toEqual({
      htmlUrl: url,
      createdAt: '2026-11-01T10:00:00Z',
      login: 'reviewer'
    })
  })

  it('rejects another permalink and a malformed answer', () => {
    expect(() =>
      readAeroNyaReviewComment(json('https://github.com/o/r/pull/12#discussion_r999'), url)
    ).toThrow('different review comment permalink')
    expect(() => readAeroNyaReviewComment('not json', url)).toThrow('invalid review comment')
    expect(() => readAeroNyaReviewComment('{}', url)).toThrow('invalid review comment')
  })
})
