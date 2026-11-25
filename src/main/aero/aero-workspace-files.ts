import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import type { AeroParseResult } from '../../shared/aero/aero-parse-result'
import type { AeroIssue, AeroLocated } from '../../shared/aero/aero-workspace-snapshot'

const READ_BATCH_SIZE = 64
/** A harness file is a few KB; anything past this is not an artifact and is never read. */
export const AERO_MAX_FILE_BYTES = 4 * 1024 * 1024

export type AeroParseFile<T> = (
  raw: string,
  relativePath: string,
  fileStem: string
) => AeroParseResult<T>

/** The outcome of reading one fixed path: absent is normal, skipped is reported, read has the text. */
export type AeroGuardedRead =
  | { status: 'missing' }
  | { status: 'skipped'; reason: string }
  | { status: 'read'; text: string }

export type AeroProbe =
  | { status: 'missing' }
  | { status: 'skipped'; reason: string }
  | { status: 'ok' }

export function toRepoRelativePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

function isAbsentCode(code: string | undefined): boolean {
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * The real path of the repo, resolved once: every later check compares against it. A repo that does
 * not exist keeps its given path, so every probe under it reports "missing".
 */
export async function resolveAeroRepoRoot(repoPath: string): Promise<string> {
  try {
    return await realpath(repoPath)
  } catch {
    return repoPath
  }
}

function comparable(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function isInside(root: string, candidate: string): boolean {
  const base = comparable(root)
  const target = comparable(candidate)
  return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`)
}

/**
 * A fixed path is only trusted when it is a real directory or regular file that stays under the repo:
 * a symlink (the repo could point it anywhere) is skipped, and so is anything that resolves outside.
 * The reasons never carry file content, nor where a link points.
 */
async function probe(root: string, path: string, kind: 'directory' | 'file'): Promise<AeroProbe> {
  let entry
  try {
    entry = await lstat(path)
  } catch (error) {
    if (isAbsentCode(errorCode(error))) {
      return { status: 'missing' }
    }
    return { status: 'skipped', reason: `could not be inspected (${errorCode(error) ?? 'error'})` }
  }
  if (entry.isSymbolicLink()) {
    return { status: 'skipped', reason: 'is a symbolic link; skipped' }
  }
  if (kind === 'directory' ? !entry.isDirectory() : !entry.isFile()) {
    return {
      status: 'skipped',
      reason: `is not a ${kind === 'directory' ? 'directory' : 'regular file'}; skipped`
    }
  }
  if (kind === 'file' && entry.size > AERO_MAX_FILE_BYTES) {
    return { status: 'skipped', reason: 'is larger than 4 MB; skipped' }
  }
  let real
  try {
    real = await realpath(path)
  } catch (error) {
    return { status: 'skipped', reason: `could not be resolved (${errorCode(error) ?? 'error'})` }
  }
  return isInside(root, real)
    ? { status: 'ok' }
    : { status: 'skipped', reason: 'resolves outside the repository; skipped' }
}

/** Inspects a fixed directory: `ok` to walk, `missing` (normal) or `skipped` with the reason. */
export function probeDirectory(root: string, directory: string): Promise<AeroProbe> {
  return probe(root, directory, 'directory')
}

/** Inspects a fixed file without reading it: a regular, small file under the repo is `ok`. */
export function probeFile(root: string, file: string): Promise<AeroProbe> {
  return probe(root, file, 'file')
}

/**
 * Reads a fixed file as UTF-8 text once `probe` trusts it. The handle is checked after it is open
 * (same device and inode as the `lstat`, regular, within the cap), so a swap between the check and
 * the read cannot redirect it, and the read is bounded by the cap whatever the file grows to.
 * Other read failures propagate.
 */
export async function readGuardedFile(root: string, file: string): Promise<AeroGuardedRead> {
  const result = await probe(root, file, 'file')
  if (result.status !== 'ok') {
    return result
  }
  let handle: FileHandle | undefined
  try {
    const before = await lstat(file, { bigint: true })
    handle = await open(file, 'r')
    const opened = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      return { status: 'skipped', reason: 'changed while it was being read; skipped' }
    }
    if (opened.size > BigInt(AERO_MAX_FILE_BYTES)) {
      return { status: 'skipped', reason: 'is larger than 4 MB; skipped' }
    }
    // One byte past the size detects a file that grew after the check; never more than the cap.
    const buffer = Buffer.allocUnsafe(Math.min(Number(opened.size) + 1, AERO_MAX_FILE_BYTES + 1))
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) {
        break
      }
      length += bytesRead
    }
    if (length > Number(opened.size)) {
      return { status: 'skipped', reason: 'changed while it was being read; skipped' }
    }
    return { status: 'read', text: buffer.toString('utf8', 0, length) }
  } catch (error) {
    if (isAbsentCode(errorCode(error))) {
      return { status: 'missing' }
    }
    throw error
  } finally {
    await handle?.close()
  }
}

/**
 * Sorted absolute paths of the files with `extension` under `directory`; empty when it is missing.
 * A directory or entry that is a symlink is skipped and reported, never followed.
 */
export async function listFiles(
  root: string,
  directory: string,
  extension: string,
  recursive: boolean,
  issues: AeroIssue[]
): Promise<string[]> {
  const inspected = await probeDirectory(root, directory)
  if (inspected.status === 'skipped') {
    issues.push({ path: toRepoRelativePath(root, directory), reason: inspected.reason })
    return []
  }
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isAbsentCode(errorCode(error))) {
      return []
    }
    throw error
  }
  const found: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      issues.push({
        path: toRepoRelativePath(root, path),
        reason: 'is a symbolic link; skipped'
      })
    } else if (entry.isDirectory() && recursive) {
      found.push(...(await listFiles(root, path, extension, recursive, issues)))
    } else if (entry.isFile() && extname(entry.name) === extension) {
      found.push(path)
    }
  }
  return found.sort()
}

/** Reads and parses every file; a file that fails to read or parse becomes an issue, never an exception. */
export async function parseFiles<T>(
  root: string,
  files: string[],
  parse: AeroParseFile<T>,
  issues: AeroIssue[]
): Promise<AeroLocated<T>[]> {
  const parsedFiles: AeroLocated<T>[] = []
  for (let start = 0; start < files.length; start += READ_BATCH_SIZE) {
    const batch = files.slice(start, start + READ_BATCH_SIZE)
    const outcomes = await Promise.all(
      batch.map(async (file) => {
        const path = toRepoRelativePath(root, file)
        try {
          const read = await readGuardedFile(root, file)
          if (read.status === 'missing') {
            return { path, result: { ok: false as const, issues: ['disappeared while reading'] } }
          }
          if (read.status === 'skipped') {
            return { path, result: { ok: false as const, issues: [read.reason] } }
          }
          return { path, result: parse(read.text, path, basename(file, extname(file))) }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return { path, result: { ok: false as const, issues: [`could not be read: ${reason}`] } }
        }
      })
    )
    for (const { path, result } of outcomes) {
      if (result.ok) {
        parsedFiles.push({ ...result.value, path })
      } else {
        issues.push(...result.issues.map((reason) => ({ path, reason })))
      }
    }
  }
  return parsedFiles
}
