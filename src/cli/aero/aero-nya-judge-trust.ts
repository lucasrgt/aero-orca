import { realpath } from 'node:fs'
import { relative, sep } from 'node:path'
import { runProcess } from '@orca/process-host'
import { runAeroNyaGit } from './aero-nya-git'

const LOCAL_CONFIG = '.nya/config.local.toml'
const GIT_TIMEOUT_MS = 30_000

function nativeRealPath(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    realpath.native(path, (error, value) => (error ? reject(error) : resolve(value)))
  })
}

/** git's verdict on `path`: ignored (0) or not (1); anything else is an error, never "ignored". */
async function isIgnoredByGit(root: string, path: string): Promise<boolean> {
  const result = await runProcess({
    program: 'git',
    args: ['-C', root, 'check-ignore', '-q', '--', path],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    timeoutMs: GIT_TIMEOUT_MS
  })
  if (result.timedOut || (result.code !== 0 && result.code !== 1)) {
    throw new Error(`git check-ignore ${path} failed: ${result.stderr.trim()}`)
  }
  return result.code === 0
}

/**
 * A judge `command` is code to run, so it must come from the developer and not from a clone. The
 * repo's `.nya/config.local.toml` is that only when git sees it as untracked and ignored. Tracking
 * is asked case-insensitively and for the file's real on-disk path, since a case-insensitive
 * filesystem opens `Config.Local.toml` as `config.local.toml`, and `.nya` itself is already known
 * to be a real directory (the caller refuses a symlink).
 */
export async function assertJudgeCommandIsPersonal(root: string, file: string): Promise<void> {
  const real = relative(root, await nativeRealPath(file))
    .split(sep)
    .join('/')
  const tracked = await runAeroNyaGit(
    root,
    ['ls-files', '-z', '--', `:(literal,icase)${LOCAL_CONFIG}`, `:(literal,icase)${real}`],
    { trim: true }
  )
  if (tracked !== '') {
    throw new Error(
      `${LOCAL_CONFIG} is committed to the repository and names a judge command; refusing to run a command a clone supplied. Untrack it or use a built-in judge`
    )
  }
  if (!(await isIgnoredByGit(root, LOCAL_CONFIG))) {
    throw new Error(
      `${LOCAL_CONFIG} names a judge command but git does not ignore it; refusing to run a command that may have come with a clone. Add it to .nya/.gitignore or use a built-in judge`
    )
  }
}
