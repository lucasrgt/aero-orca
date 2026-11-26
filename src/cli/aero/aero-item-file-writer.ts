import { randomBytes } from 'node:crypto'
import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { probeDirectory, probeFile } from '../../main/aero/aero-workspace-files'

const RENAME_TRIES = 3
const RENAME_RETRY_MS = 50
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

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      // Windows refuses a rename onto a file an antivirus or indexer holds open, for a moment.
      if (errorCode(error) !== 'EPERM' || attempt >= RENAME_TRIES) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS))
    }
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
  const directory = await ensureItemFolder(root, folders)
  const target = join(directory, fileName)
  const existing = await inspectTarget(target)
  if (existing === 'other' || (existing === 'file' && mode === 'create')) {
    throw new Error(`${fileName} already exists; refusing to replace it`)
  }
  const temp = join(directory, `.${fileName}.tmp-${randomBytes(8).toString('hex')}`)
  try {
    await writeFile(temp, text, { encoding: 'utf8', flag: 'wx' })
    await renameWithRetry(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
  return target
}

/** Removes an item file the reader found, after checking it is still a regular file under the repo. */
export async function removeAeroItemFile(root: string, file: string): Promise<void> {
  if ((await probeFile(root, file)).status === 'ok') {
    await unlink(file)
  }
}
