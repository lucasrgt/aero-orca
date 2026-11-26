import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildAeroNyaNewFilePatch,
  parseAeroNyaNameStatus
} from '../../shared/aero/aero-nya-diff-chunks'
import { runAeroNyaGit } from './aero-nya-git'

// NYA's own store is never part of what is audited.
const EXCLUDE_NYA = ':(exclude).nya/**'
const QUOTE_PATH_OFF = ['-c', 'core.quotePath=false']
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export type AeroNyaDiff = { body: string; paths: string[] }

/**
 * An untracked file's text, whatever its size (Aero reads it whole). Like Aero, a file that is not
 * valid UTF-8 or cannot be read counts as empty. Unlike Aero it never follows a symlink, so an
 * untracked link cannot pull a file from outside the repo into the judge's prompt.
 */
async function readUntrackedText(root: string, path: string): Promise<string> {
  const file = join(root, ...path.split('/'))
  try {
    if (!(await lstat(file)).isFile()) {
      return ''
    }
    return STRICT_UTF8.decode(await readFile(file))
  } catch {
    return ''
  }
}

/**
 * What a check audits: `git diff <base>` (HEAD by default, so staged and unstaged work) plus every
 * untracked, unignored file as a new-file patch, with the changed paths. A `base` that could be read
 * as a git option is refused.
 */
export async function collectAeroNyaDiff(
  root: string,
  base: string | undefined
): Promise<AeroNyaDiff> {
  const revision = base ?? 'HEAD'
  if (revision.startsWith('-')) {
    throw new Error(`invalid base \`${revision}\`: a revision cannot start with "-"`)
  }
  let body = await runAeroNyaGit(
    root,
    [...QUOTE_PATH_OFF, 'diff', '--no-ext-diff', '--unified=4', revision, '--', '.', EXCLUDE_NYA],
    { trim: true }
  )
  const paths = parseAeroNyaNameStatus(
    await runAeroNyaGit(root, [
      ...QUOTE_PATH_OFF,
      'diff',
      '--name-status',
      '-z',
      revision,
      '--',
      '.',
      EXCLUDE_NYA
    ])
  )
  const untracked = await runAeroNyaGit(
    root,
    [...QUOTE_PATH_OFF, 'ls-files', '--others', '--exclude-standard', '--', '.', EXCLUDE_NYA],
    { trim: true }
  )
  for (const path of untracked.split(/\r?\n/).filter((line) => line.length > 0)) {
    body += buildAeroNyaNewFilePatch(path, await readUntrackedText(root, path))
    paths.push(path)
  }
  return { body, paths }
}
