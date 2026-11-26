import type { AeroNyaScar } from './aero-nya'
import { compileAeroNyaGlob } from './aero-nya-glob'

type AeroNyaOccurrence = AeroNyaScar['occurrences'][number]

export type AeroNyaRememberRequest = {
  scar?: string
  title?: string
  lesson?: string
  scope: string[]
  tags: string[]
  source?: string
  githubReview?: string
  reportedBy?: string
  correctedBy?: string
  recordedBy?: string
}

/** What `gh api` returned for a review comment, reduced to what an occurrence records. */
export type AeroNyaReviewComment = { htmlUrl: string; createdAt: string; login: string }

export type AeroNyaRememberContext = {
  now: Date
  /** `git:<user.email>` of the repo, when it has one. */
  actor?: string
  /** `git rev-parse --short HEAD`, when the repo has a commit. */
  commit?: string
  review?: AeroNyaReviewComment
  /** A fresh `NYA-<ULID>`, used only for a new scar. */
  newId: string
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ULID_TIME_CHARS = 10
const ULID_RANDOM_BYTES = 10

/** A ULID: 48 bits of millisecond time and 80 random bits, 26 Crockford base32 characters. */
export function generateAeroUlid(nowMs: number, randomBytes: Uint8Array): string {
  if (randomBytes.length !== ULID_RANDOM_BYTES) {
    throw new Error('a ULID needs 10 random bytes')
  }
  let time = ''
  let remaining = BigInt(nowMs)
  for (let index = 0; index < ULID_TIME_CHARS; index += 1) {
    time = CROCKFORD[Number(remaining % 32n)] + time
    remaining /= 32n
  }
  let random = ''
  let value = 0n
  for (const byte of randomBytes) {
    value = (value << 8n) | BigInt(byte)
  }
  for (let index = 0; index < 16; index += 1) {
    random = CROCKFORD[Number(value % 32n)] + random
    value /= 32n
  }
  return time + random
}

function secondsTimestamp(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`
}

function normalizeTitle(title: string): string {
  return title.split(/\s+/u).filter(Boolean).join(' ').toLowerCase()
}

/** Every rule `nya validate` holds a scar to; the first broken one is the error. */
export function assertValidAeroNyaScar(scar: AeroNyaScar): void {
  if (scar.schema !== 1) {
    throw new Error(`${scar.id} has unsupported schema ${scar.schema}`)
  }
  if (!scar.id.startsWith('NYA-') || scar.title.trim() === '' || scar.lesson.trim() === '') {
    throw new Error(`invalid scar ${scar.id}`)
  }
  if (scar.scope.length === 0) {
    throw new Error(
      `${scar.id} has no scope; add a specific glob or "**" for an explicitly global scar`
    )
  }
  if (scar.occurrences.length === 0) {
    throw new Error(`${scar.id} has no occurrences`)
  }
  for (const scope of scar.scope) {
    if (compileAeroNyaGlob(scope) === undefined) {
      throw new Error(`invalid scope in ${scar.id}`)
    }
  }
  const actors = scar.occurrences.flatMap((occurrence) => [
    occurrence.reported_by,
    occurrence.corrected_by,
    occurrence.recorded_by,
    occurrence.recorded_for
  ])
  for (const actor of actors) {
    if (actor !== undefined && !actor.includes(':')) {
      throw new Error(`actor must be namespaced: ${actor}`)
    }
  }
}

/** A review permalink supplies the source and the reporter, so it cannot come with either. */
export function assertReviewIsExclusive(request: AeroNyaRememberRequest): void {
  if (
    request.githubReview !== undefined &&
    (request.source !== undefined || request.reportedBy !== undefined)
  ) {
    throw new Error(
      '--github-review supplies source and reporter; do not combine it with --source or --reported-by'
    )
  }
}

function buildOccurrence(
  request: AeroNyaRememberRequest,
  context: AeroNyaRememberContext
): AeroNyaOccurrence {
  const { review } = context
  const occurrence: AeroNyaOccurrence = {
    occurred_at: review?.createdAt ?? secondsTimestamp(context.now),
    source: review?.htmlUrl ?? request.source,
    reported_by: review ? `github:${review.login}` : request.reportedBy,
    corrected_by: request.correctedBy ?? context.actor,
    recorded_by: request.recordedBy ?? context.actor,
    recorded_for: undefined,
    commit: context.commit
  }
  return Object.fromEntries(
    Object.entries(occurrence).filter(([, value]) => value !== undefined)
  ) as AeroNyaOccurrence
}

function nonBlank(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required for a new scar`)
  }
  return value
}

/**
 * The scar `nya remember` stores: an occurrence appended to the scar named by `scar` (or whose title
 * matches), else a new scar. `existing` is every scar in the repo; the result is what to write.
 */
export function rememberAeroNyaScar(
  existing: readonly AeroNyaScar[],
  request: AeroNyaRememberRequest,
  context: AeroNyaRememberContext
): { scar: AeroNyaScar; created: boolean } {
  assertReviewIsExclusive(request)
  const occurrence = buildOccurrence(request, context)
  const title = request.title === undefined ? undefined : normalizeTitle(request.title)
  const byId =
    request.scar === undefined ? undefined : existing.find((scar) => scar.id === request.scar)
  const byTitle =
    title === undefined ? undefined : existing.find((scar) => normalizeTitle(scar.title) === title)
  const found = byId ?? byTitle
  if (request.scar !== undefined && found === undefined) {
    throw new Error(`scar ${request.scar} was not found`)
  }
  const scar: AeroNyaScar = found
    ? { ...found, occurrences: [...found.occurrences, occurrence] }
    : {
        schema: 1,
        id: context.newId,
        title: nonBlank(request.title, '--title'),
        lesson: nonBlank(request.lesson, '--lesson'),
        scope: request.scope,
        tags: request.tags,
        created_at: secondsTimestamp(context.now),
        occurrences: [occurrence]
      }
  assertValidAeroNyaScar(scar)
  return { scar, created: found === undefined }
}

const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/
const REPO_PART_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/

/** `gh api` arguments for a `https://<host>/<owner>/<repo>/pull/<n>#discussion_r<id>` permalink. */
export function parseAeroNyaReviewPermalink(url: string): { hostname: string; endpoint: string } {
  const marker = url.indexOf('#discussion_r')
  if (marker === -1) {
    throw new Error('--github-review must be a GitHub pull-request review comment permalink')
  }
  const base = url.slice(0, marker)
  const id = url.slice(marker + '#discussion_r'.length)
  if (!base.startsWith('https://')) {
    throw new Error('--github-review must use https')
  }
  const parts = base.slice('https://'.length).split('/')
  const [hostname, owner, repo, kind, pull] = parts
  const valid =
    parts.length === 5 &&
    kind === 'pull' &&
    /^\d+$/.test(pull) &&
    /^\d+$/.test(id) &&
    HOST_PATTERN.test(hostname) &&
    REPO_PART_PATTERN.test(owner) &&
    REPO_PART_PATTERN.test(repo)
  if (!valid) {
    throw new Error('invalid GitHub review permalink')
  }
  return { hostname, endpoint: `repos/${owner}/${repo}/pulls/comments/${id}` }
}

/** The review comment fields an occurrence needs, from the JSON `gh api` printed. */
export function readAeroNyaReviewComment(json: string, permalink: string): AeroNyaReviewComment {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('GitHub returned an invalid review comment')
  }
  const comment = value as { html_url?: unknown; created_at?: unknown; user?: { login?: unknown } }
  const { html_url: htmlUrl, created_at: createdAt } = comment
  const login = comment.user?.login
  if (typeof htmlUrl !== 'string' || typeof createdAt !== 'string' || typeof login !== 'string') {
    throw new Error('GitHub returned an invalid review comment')
  }
  if (htmlUrl !== permalink) {
    throw new Error('GitHub returned a different review comment permalink')
  }
  return { htmlUrl, createdAt, login }
}
