import { randomBytes } from 'node:crypto'
import { runProcess } from '@orca/process-host'
import type { AeroNyaScar } from '../../shared/aero/aero-nya'
import {
  auditAeroNyaDiff,
  type AeroNyaCheckResult,
  type AeroNyaJudge
} from '../../shared/aero/aero-nya-check-audit'
import { recallAeroNyaScars, type AeroNyaRecallRequest } from '../../shared/aero/aero-nya-recall'
import {
  assertReviewIsExclusive,
  generateAeroUlid,
  parseAeroNyaReviewPermalink,
  readAeroNyaReviewComment,
  rememberAeroNyaScar,
  type AeroNyaRememberRequest,
  type AeroNyaReviewComment
} from '../../shared/aero/aero-nya-remember'
import { withAeroNyaScarsLock, type AeroKnowledgeLockOptions } from './aero-knowledge-lock'
import { collectAeroNyaDiff } from './aero-nya-diff-collector'
import { runAeroNyaGit } from './aero-nya-git'
import { resolveAeroNyaJudge } from './aero-nya-judge-process'
import { readAeroNyaScars, writeAeroNyaScar } from './aero-nya-scar-store'

const GH_TIMEOUT_MS = 60_000

export type AeroNyaOperationOptions = {
  /** How the judge is started; the isolated CLI judge of the repo's configuration by default. */
  resolveJudge?: (root: string) => Promise<AeroNyaJudge>
  lock?: AeroKnowledgeLockOptions
  now?: () => Date
}

export async function recallAeroNya(
  root: string,
  request: AeroNyaRecallRequest
): Promise<AeroNyaScar[]> {
  const stored = await readAeroNyaScars(root)
  return recallAeroNyaScars(
    stored.map(({ scar }) => scar),
    request
  )
}

export async function checkAeroNya(
  root: string,
  request: { base?: string },
  options: AeroNyaOperationOptions = {}
): Promise<AeroNyaCheckResult> {
  const { body, paths } = await collectAeroNyaDiff(root, request.base)
  // An empty diff passes before the scars are read, so an uninitialized repo still passes like Aero.
  if (body.trim() === '') {
    return { passed: true, scars_checked: 0, findings: [] }
  }
  const stored = await readAeroNyaScars(root)
  return auditAeroNyaDiff({
    scars: stored.map(({ scar }) => scar),
    body,
    paths,
    resolveJudge: () => (options.resolveJudge ?? resolveAeroNyaJudge)(root)
  })
}

/** The review comment behind a `#discussion_r` permalink, read through the user's own `gh`. */
async function fetchReviewComment(permalink: string): Promise<AeroNyaReviewComment> {
  const { hostname, endpoint } = parseAeroNyaReviewPermalink(permalink)
  const result = await runProcess({
    program: process.env.NYA_GH ?? 'gh',
    args: ['api', '--hostname', hostname, endpoint],
    timeoutMs: GH_TIMEOUT_MS
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`failed to start GitHub CLI; install and authenticate \`gh\`: ${reason}`)
  })
  if (result.timedOut || result.code !== 0) {
    throw new Error(`gh api failed: ${result.timedOut ? 'timed out' : result.stderr.trim()}`)
  }
  return readAeroNyaReviewComment(result.stdout, permalink)
}

async function optionalGit(root: string, args: string[]): Promise<string | undefined> {
  const value = await runAeroNyaGit(root, args, { trim: true }).catch(() => '')
  return value === '' ? undefined : value
}

/** Stores a corrected, reusable failure as a scar, or appends an occurrence to an existing one. */
export async function rememberAeroNya(
  root: string,
  request: AeroNyaRememberRequest,
  options: AeroNyaOperationOptions = {}
): Promise<AeroNyaScar> {
  assertReviewIsExclusive(request)
  const review =
    request.githubReview === undefined ? undefined : await fetchReviewComment(request.githubReview)
  const email = await optionalGit(root, ['config', 'user.email'])
  const commit = await optionalGit(root, ['rev-parse', '--short', 'HEAD'])
  const now = options.now?.() ?? new Date()
  return withAeroNyaScarsLock(
    root,
    async () => {
      const stored = await readAeroNyaScars(root)
      const { scar, created } = rememberAeroNyaScar(
        stored.map((entry) => entry.scar),
        request,
        {
          now,
          actor: email === undefined ? undefined : `git:${email}`,
          commit,
          review,
          newId: `NYA-${generateAeroUlid(now.getTime(), randomBytes(10))}`
        }
      )
      const file = stored.find((entry) => entry.scar.id === scar.id)
      await writeAeroNyaScar(
        root,
        scar,
        created || file === undefined
          ? { mode: 'create' }
          : { mode: 'replace', fileName: file.fileName }
      )
      return scar
    },
    options.lock
  )
}
