import { randomBytes } from 'node:crypto'
import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { probeDirectory, probeFile } from '../../main/aero/aero-workspace-files'

const RETRY_TRIES = 3
const RETRY_DELAY_MS = 50
const ITEMS_FOLDERS = ['.aerofortress', 'items']

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

/**
 * Walks `.aerofortress/items/<folders>` creating what is missing. Every level must be a real
 * directory under the repo: a symlink, or anything resolving outside, aborts the write.
 */
async function ensureItemFolder(root: string, folders: readonly string[]): Promise<string> {
  let directory = root
  for (const segment of [...ITEMS_FOLDERS, ...folders]) {
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

/** A file name is one plain path segment: no separator, no `..`, no NUL. */
function assertPlainFileName(fileName: string): void {
  if (
    fileName.length === 0 ||
    fileName !== basename(fileName) ||
    /[\\/\0]/.test(fileName) ||
    fileName.includes('..')
  ) {
    throw new Error('refusing an item file name that is not a plain file name')
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

/**
 * Writes one item file: a temp file in the same folder, then a rename over the target. The write
 * stays under `.aerofortress/items`, follows no symlink and never replaces a non-file; `create`
 * also refuses to replace a file. Returns the absolute path written.
 */
export async function writeAeroItemFile(
  root: string,
  folders: readonly string[],
  fileName: string,
  text: string,
  mode: 'create' | 'replace'
): Promise<string> {
  assertPlainFileName(fileName)
  const directory = await ensureItemFolder(root, folders)
  const target = join(directory, fileName)
  const existing = await inspectTarget(target)
  if (existing === 'other' || (existing === 'file' && mode === 'create')) {
    throw new Error(`${fileName} already exists; refusing to replace it`)
  }
  const temp = join(directory, `.${fileName}.tmp-${randomBytes(8).toString('hex')}`)
  try {
    await writeFile(temp, text, { encoding: 'utf8', flag: 'wx' })
    await retryWhileBusy(() => rename(temp, target))
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
  return target
}

/** Whether two paths are one file; a case-insensitive filesystem makes `Arch` and `arch` the same. */
async function isSameFile(a: string, b: string): Promise<boolean> {
  const [first, second] = await Promise.all([
    lstat(a, { bigint: true }).catch(() => null),
    lstat(b, { bigint: true }).catch(() => null)
  ])
  return first !== null && second !== null && first.dev === second.dev && first.ino === second.ino
}

/**
 * Removes the item files the reader found at `files`, except `keep` (the file just written) and
 * any path that is the same file as it. Each is checked to still be a regular file under the repo;
 * a removal that keeps failing is reported, never thrown, since the write already succeeded.
 */
export async function removeOtherAeroItemFiles(
  root: string,
  files: readonly string[],
  keep: string
): Promise<string[]> {
  const warnings: string[] = []
  for (const file of files) {
    if (file === keep || (await isSameFile(file, keep))) {
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
