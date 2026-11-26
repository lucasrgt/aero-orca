import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { probeDirectory } from '../../main/aero/aero-workspace-files'

const LOCK_FILE = '.knowledge.lock'
const ACQUIRE_TIMEOUT_MS = 5000
const STALE_AFTER_MS = 30_000
const FIRST_DELAY_MS = 15
const MAX_DELAY_MS = 250

type LockContent = { pid: number; at: number; token: string }

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
    const valid = Number.isInteger(parsed.pid) && typeof parsed.at === 'number'
    return { raw, content: valid ? (parsed as LockContent) : null }
  } catch {
    return { raw, content: null }
  }
}

/** A lock is stale once its holder is gone or it has been held longer than any write takes. */
async function isStale(path: string, held: { content: LockContent | null }): Promise<boolean> {
  if (held.content) {
    return Date.now() - held.content.at > STALE_AFTER_MS || !isProcessAlive(held.content.pid)
  }
  // Unreadable content: a writer may be between creating the file and filling it, so use its age.
  const entry = await lstat(path).catch(() => null)
  return entry !== null && Date.now() - entry.mtimeMs > STALE_AFTER_MS
}

async function ensureAerofortressDirectory(root: string): Promise<string> {
  const directory = join(root, '.aerofortress')
  let probed = await probeDirectory(root, directory)
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
      `.aerofortress cannot be written to: ${probed.status === 'skipped' ? probed.reason : 'missing'}`
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
    const content: LockContent = { pid: process.pid, at: Date.now(), token }
    await handle.writeFile(JSON.stringify(content), 'utf8')
  } finally {
    await handle.close()
  }
  return true
}

async function release(path: string, token: string): Promise<void> {
  const held = await readLock(path).catch(() => null)
  // Never remove a lock another process broke and took over in the meantime.
  if (held?.content?.token === token) {
    await unlink(path).catch(() => {})
  }
}

/**
 * Runs `task` while holding `.aerofortress/.knowledge.lock`, so two `orca aero mcp` processes (one
 * per agent) never interleave a read-modify-write on the same repo. The lock is an exclusive-create
 * file holding the pid and a timestamp. A waiter retries with backoff for about five seconds, and
 * breaks a lock whose holder is dead or that is older than thirty seconds. Released in `finally`.
 */
export async function withAeroKnowledgeLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const path = join(await ensureAerofortressDirectory(root), LOCK_FILE)
  const token = randomBytes(8).toString('hex')
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  let delay = FIRST_DELAY_MS
  while (!(await tryCreate(path, token))) {
    const held = await readLock(path)
    if (held && (await isStale(path, held))) {
      // Remove only the lock that was judged stale: re-read so a fresh one is never discarded.
      const again = await readLock(path)
      if (again?.raw === held.raw) {
        await unlink(path).catch(() => {})
      }
      if (Date.now() < deadline) {
        continue
      }
    }
    if (Date.now() >= deadline) {
      const holder = held?.content ? ` (pid ${held.content.pid})` : ''
      throw new Error(`the knowledge network is locked by another process${holder}; try again`)
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
