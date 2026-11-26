import { join } from 'node:path'
import {
  buildAeroNyaNewFilePatch,
  parseAeroNyaNameStatus
} from '../../shared/aero/aero-nya-diff-chunks'
import { readGuardedFile } from '../../main/aero/aero-workspace-files'
import { runAeroNyaGit } from './aero-nya-git'

// NYA's own store is never part of what is audited.
const EXCLUDE_NYA = ':(exclude).nya/**'
const QUOTE_PATH_OFF = ['-c', 'core.quotePath=false']
// Decoding invalid UTF-8 yields this character; Aero reads such a file as empty.
const INVALID_UTF8_MARKER = String.fromCodePoint(0xfffd)

export type AeroNyaDiff = { body: string; paths: string[] }

/** An untracked file's text; unreadable, binary, oversized and symlinked files count as empty. */
async function readUntrackedText(root: string, path: string): Promise<string> {
  const read = await readGuardedFile(root, join(root, ...path.split('/'))).catch(() => null)
  return read?.status === 'read' && !read.text.includes(INVALID_UTF8_MARKER) ? read.text : ''
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
