import { randomBytes } from 'node:crypto'
import { realpath as realpathCallback } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { probeDirectory, probeFile } from '../../main/aero/aero-workspace-files'

const RETRY_TRIES = 3
const RETRY_DELAY_MS = 50
const ITEMS_FOLDERS = ['.aerofortress', 'items']

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

/**
 * Walks `<base>/<folders>` creating what is missing. Every level must be a real directory under the
 * repo: a symlink, or anything resolving outside, aborts the write.
 */
async function ensureFolder(
  root: string,
  base: readonly string[],
  folders: readonly string[]
): Promise<string> {
  let directory = root
  for (const segment of [...base, ...folders]) {
    if (segment === '.' || segment === '..' || /[\\/]/.test(segment)) {
      throw new Error(`refusing unsafe folder name "${segment}"`)
    }
    directory = join(directory, segment)
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
        `${segment} cannot be written to: ${probed.status === 'skipped' ? probed.reason : 'missing'}`
      )
    }
  }
  return directory
}

/** Windows refuses to touch a file an antivirus or indexer holds open, for a moment. */
async function retryWhileBusy(action: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await action()
      return
    } catch (error) {
      const code = errorCode(error)
      if ((code !== 'EPERM' && code !== 'EBUSY') || attempt >= RETRY_TRIES) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

/** A file name is one plain path segment: no separator, not `.` or `..`, no NUL. */
function assertPlainFileName(fileName: string): void {
  if (
    fileName.length === 0 ||
    fileName !== basename(fileName) ||
    /[\\/\0]/.test(fileName) ||
    fileName === '.' ||
    fileName === '..'
  ) {
    throw new Error('refusing an item file name that is not a plain file name')
  }
}

/** Creates `path` (never over a file) and flushes it to disk, so a crash cannot leave a renamed empty file. */
async function writeDurableFile(path: string, text: string): Promise<void> {
  const handle = await open(path, 'wx')
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** What is at the target: nothing, a regular file, or something a write must never replace. */
async function inspectTarget(target: string): Promise<'absent' | 'file' | 'other'> {
  try {
    return (await lstat(target)).isFile() ? 'file' : 'other'
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return 'absent'
    }
    throw error
  }
}

/** A `beforeRename` precondition failed: the target changed after it was read, so nothing was written. */
export class AeroWriteConflictError extends Error {}

/**
 * Writes one file: a temp file in the same folder, then a rename over the target. The write stays
 * under `<base>/<folders>`, follows no symlink and never replaces a non-file; `create` also refuses
 * to replace a file. `beforeRename` runs once the temp file is durable, right before the rename;
 * a false answer abandons the write with `AeroWriteConflictError`. Returns the absolute path written.
 */
export async function writeAeroGuardedFile(
  root: string,
  base: readonly string[],
  folders: readonly string[],
  fileName: string,
  text: string,
  mode: 'create' | 'replace',
  beforeRename?: () => Promise<boolean>
): Promise<string> {
  assertPlainFileName(fileName)
  const directory = await ensureFolder(root, base, folders)
  const target = join(directory, fileName)
  const existing = await inspectTarget(target)
  if (existing === 'other' || (existing === 'file' && mode === 'create')) {
    throw new Error(`${fileName} already exists; refusing to replace it`)
  }
  const temp = join(directory, `.${fileName}.tmp-${randomBytes(8).toString('hex')}`)
  try {
    await writeDurableFile(temp, text)
    if (beforeRename && !(await beforeRename())) {
      throw new AeroWriteConflictError(`${fileName} changed while it was being rewritten`)
    }
    await retryWhileBusy(() => rename(temp, target))
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
  return target
}

/** One item file under `.aerofortress/items/<folders>`; see `writeAeroGuardedFile`. */
export function writeAeroItemFile(
  root: string,
  folders: readonly string[],
  fileName: string,
  text: string,
  mode: 'create' | 'replace'
): Promise<string> {
  return writeAeroGuardedFile(root, ITEMS_FOLDERS, folders, fileName, text, mode)
}

type SameFile = 'same' | 'different' | 'unknown'

async function canonicalPath(path: string): Promise<string> {
  const resolved = await new Promise<string>((resolve, reject) => {
    realpathCallback.native(path, (error, value) => (error ? reject(error) : resolve(value)))
  })
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Whether two paths are one file; a case-insensitive filesystem makes `Arch` and `arch` the same.
 * Compares dev+ino; an inode of 0 means the filesystem does not report one (some Windows
 * filesystems), so the canonical paths are compared instead. Anything that cannot be established
 * is `unknown`, which callers treat as "do not delete".
 */
async function compareFiles(
  a: string,
  b: string,
  keepStat: { dev: bigint; ino: bigint }
): Promise<SameFile> {
  const other = await lstat(a, { bigint: true }).catch(() => null)
  if (other === null) {
    return 'unknown'
  }
  if (other.ino !== 0n && keepStat.ino !== 0n) {
    return other.dev === keepStat.dev && other.ino === keepStat.ino ? 'same' : 'different'
  }
  try {
    const [first, second] = await Promise.all([canonicalPath(a), canonicalPath(b)])
    return first === second ? 'same' : 'different'
  } catch {
    return 'unknown'
  }
}

/**
 * Removes the item files the reader found at `files`, except `keep` (the file just written) and
 * any path that is the same file as it. Each is checked to still be a regular file under the repo;
 * a removal that keeps failing is reported, never thrown, since the write already succeeded. It
 * fails safe: if `keep` cannot be examined nothing is removed, and a copy it cannot prove distinct
 * is left alone. Every skipped removal comes back as a warning.
 */
export async function removeOtherAeroItemFiles(
  root: string,
  files: readonly string[],
  keep: string
): Promise<string[]> {
  const keepStat = await lstat(keep, { bigint: true }).catch(() => null)
  if (keepStat === null) {
    return [`could not examine the written file ${keep}; left every other copy in place`]
  }
  const warnings: string[] = []
  for (const file of files) {
    if (file === keep) {
      continue
    }
    const relation = await compareFiles(file, keep, keepStat)
    if (relation === 'same') {
      warnings.push(`left ${file} in place: it is the same file as ${keep}`)
      continue
    }
    if (relation === 'unknown') {
      if (await lstat(file).catch(() => null)) {
        warnings.push(
          `left ${file} in place: could not tell whether it is the same file as ${keep}`
        )
      }
      continue
    }
    try {
      if ((await probeFile(root, file)).status === 'ok') {
        await retryWhileBusy(() => unlink(file))
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        warnings.push(
          `could not remove the old copy ${file} (${errorCode(error) ?? 'error'}); remove it by hand`
        )
      }
    }
  }
  return warnings
}
