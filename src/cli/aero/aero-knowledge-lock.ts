import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { probeDirectory } from '../../main/aero/aero-workspace-files'

const ACQUIRE_TIMEOUT_MS = 5000
/** A holder that is provably alive (same host) or unverifiable (another host) is trusted this long. */
const HOLDER_LIMIT_MS = 120_000
/** A lock file with unreadable content is a writer between create and fill; give it this long. */
const UNREADABLE_LIMIT_MS = 30_000
/** The break lock guards one unlink; a crashed breaker must not wedge everyone for longer. */
const BREAK_LIMIT_MS = 10_000
const FIRST_DELAY_MS = 15
const MAX_DELAY_MS = 250
const RELEASE_READ_TRIES = 4
const RELEASE_READ_DELAY_MS = 25

type LockContent = { hostname: string; pid: number; at: number; token: string }

export type AeroKnowledgeLockOptions = { timeoutMs?: number }

/** Which directory holds the lock and under which names; `create` is whether a missing directory is made. */
type AeroLockTarget = {
  directory: string
  lockFile: string
  breakFile: string
  subject: string
  create: boolean
}

const KNOWLEDGE_LOCK: AeroLockTarget = {
  directory: '.aerofortress',
  lockFile: '.knowledge.lock',
  breakFile: '.knowledge.lock.break',
  subject: 'the knowledge network',
  create: true
}

const NYA_SCARS_LOCK: AeroLockTarget = {
  directory: '.nya',
  lockFile: '.scars.lock',
  breakFile: '.scars.lock.break',
  subject: 'the NYA scars',
  create: false
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return errorCode(error) === 'EPERM'
  }
}

async function readLock(
  path: string
): Promise<{ raw: string; content: LockContent | null } | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return null
    }
    throw error
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LockContent>
    const valid =
      typeof parsed.hostname === 'string' &&
      Number.isInteger(parsed.pid) &&
      typeof parsed.at === 'number'
    return { raw, content: valid ? (parsed as LockContent) : null }
  } catch {
    return { raw, content: null }
  }
}

/** Age of the lock file by its mtime: one filesystem clock, so no holder/waiter clock skew. */
async function fileAgeMs(path: string): Promise<number | null> {
  const entry = await lstat(path).catch(() => null)
  return entry === null ? null : Date.now() - entry.mtimeMs
}

/**
 * A same-host lock is stale once its pid is gone (at once) or it outlived the holder limit. A lock
 * from another host (or WSL versus Windows) cannot be probed by pid, so only its age counts, read
 * from the file's mtime. Unreadable content is judged by age alone.
 */
async function isStale(
  path: string,
  held: { content: LockContent | null },
  limitMs: number = HOLDER_LIMIT_MS
): Promise<boolean> {
  const age = await fileAgeMs(path)
  if (age === null) {
    return false
  }
  if (!held.content) {
    return age > Math.min(limitMs, UNREADABLE_LIMIT_MS)
  }
  if (held.content.hostname === hostname() && !isProcessAlive(held.content.pid)) {
    return true
  }
  return age > limitMs
}

async function ensureLockDirectory(root: string, target: AeroLockTarget): Promise<string> {
  const directory = join(root, target.directory)
  let probed = await probeDirectory(root, directory)
  if (probed.status === 'missing' && !target.create) {
    throw new Error(
      `${target.directory} does not exist; this repository is not initialized (run nya init)`
    )
  }
  if (probed.status === 'missing') {
    await mkdir(directory).catch((error: unknown) => {
      if (errorCode(error) !== 'EEXIST') {
        throw error
      }
    })
    probed = await probeDirectory(root, directory)
  }
  if (probed.status !== 'ok') {
    throw new Error(
      `${target.directory} cannot be written to: ${probed.status === 'skipped' ? probed.reason : 'missing'}`
    )
  }
  return directory
}

async function tryCreate(path: string, token: string): Promise<boolean> {
  let handle
  try {
    handle = await open(path, 'wx')
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      return false
    }
    throw error
  }
  try {
    const content: LockContent = { hostname: hostname(), pid: process.pid, at: Date.now(), token }
    await handle.writeFile(JSON.stringify(content), 'utf8')
    await handle.close()
  } catch (error) {
    // Never leave an empty or half-written lock behind that would block everyone until it ages out.
    await handle.close().catch(() => {})
    await unlink(path).catch(() => {})
    throw error
  }
  return true
}

async function readForRelease(path: string): Promise<{ content: LockContent | null } | null> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await readLock(path)
    } catch (error) {
      const code = errorCode(error)
      if ((code !== 'EPERM' && code !== 'EBUSY') || attempt >= RELEASE_READ_TRIES) {
        return null
      }
      await sleep(RELEASE_READ_DELAY_MS)
    }
  }
}

async function release(path: string, token: string): Promise<void> {
  const held = await readForRelease(path)
  // Never remove a lock another process broke and took over in the meantime.
  if (held?.content?.token === token) {
    await unlink(path).catch(() => {})
  }
}

/**
 * Removes a lock judged stale, serialised by a short-lived break lock so two waiters can never
 * both break it and then both hold it. Only the break lock's holder unlinks, and only after
 * re-reading the lock and finding the very same stale content. Returns whether it held the break
 * lock (false means another breaker is busy, so the caller should back off).
 */
async function breakStale(
  path: string,
  breakPath: string,
  token: string,
  stale: { raw: string }
): Promise<boolean> {
  if (!(await tryCreate(breakPath, token))) {
    // A crashed breaker's lock expires; a live one is simply waited out.
    const holder = await readLock(breakPath)
    if (holder && (await isStale(breakPath, holder, BREAK_LIMIT_MS))) {
      const again = await readLock(breakPath)
      if (again?.raw === holder.raw) {
        await unlink(breakPath).catch(() => {})
      }
    }
    return false
  }
  try {
    const current = await readLock(path)
    if (current && current.raw === stale.raw && (await isStale(path, current))) {
      await unlink(path).catch(() => {})
    }
  } finally {
    await release(breakPath, token)
  }
  return true
}

/**
 * Runs `task` while holding the lock file of `target`, so two processes never interleave a
 * read-modify-write on the same repo. The lock is an exclusive-create file holding the host name,
 * pid and a timestamp. A waiter retries with backoff for about five seconds. It breaks a lock held
 * by a dead pid on this host at once, and any other lock only after two minutes (judged by the
 * file's mtime, so another machine's clock never matters). Breaking goes through the break file.
 * Released in `finally`.
 */
async function withAeroLock<T>(
  root: string,
  target: AeroLockTarget,
  task: () => Promise<T>,
  options: AeroKnowledgeLockOptions
): Promise<T> {
  const directory = await ensureLockDirectory(root, target)
  const path = join(directory, target.lockFile)
  const breakPath = join(directory, target.breakFile)
  const token = randomBytes(8).toString('hex')
  const deadline = Date.now() + (options.timeoutMs ?? ACQUIRE_TIMEOUT_MS)
  let delay = FIRST_DELAY_MS
  while (!(await tryCreate(path, token))) {
    const held = await readLock(path)
    if (held && (await isStale(path, held))) {
      // Retry at once only after actually going through the break; a busy break lock means wait.
      if ((await breakStale(path, breakPath, token, held)) && Date.now() < deadline) {
        continue
      }
    }
    if (Date.now() >= deadline) {
      const holder = held?.content ? ` (pid ${held.content.pid} on ${held.content.hostname})` : ''
      throw new Error(`${target.subject} is locked by another process${holder}; try again`)
    }
    await sleep(delay + Math.floor(Math.random() * delay))
    delay = Math.min(delay * 2, MAX_DELAY_MS)
  }
  try {
    return await task()
  } finally {
    await release(path, token)
  }
}

/** Serialises writers of `.aerofortress/` (`.knowledge.lock`), one `orca aero mcp` per agent. */
export function withAeroKnowledgeLock<T>(
  root: string,
  task: () => Promise<T>,
  options: AeroKnowledgeLockOptions = {}
): Promise<T> {
  return withAeroLock(root, KNOWLEDGE_LOCK, task, options)
}

/** Serialises writers of `.nya/scars` (`.nya/.scars.lock`); the `.nya` directory must already exist. */
export function withAeroNyaScarsLock<T>(
  root: string,
  task: () => Promise<T>,
  options: AeroKnowledgeLockOptions = {}
): Promise<T> {
  return withAeroLock(root, NYA_SCARS_LOCK, task, options)
}
