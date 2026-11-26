import { runProcess } from '@orca/process-host'
import { resolveAeroRepoRoot } from '../../main/aero/aero-workspace-files'

const GIT_TIMEOUT_MS = 120_000
const GIT_MAX_OUTPUT_BYTES = 128 * 1024 * 1024

/**
 * Runs git in `repo` with an argument array, never a shell. The text is the raw stdout unless
 * `trim` is set; a failure, a timeout or an output past the cap is an error, so a cut-off diff can
 * never read as a clean one.
 */
export async function runAeroNyaGit(
  repo: string,
  args: readonly string[],
  options: { trim?: boolean } = {}
): Promise<string> {
  const result = await runProcess({
    program: 'git',
    args: ['-C', repo, ...args],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    timeoutMs: GIT_TIMEOUT_MS,
    maxOutputBytes: GIT_MAX_OUTPUT_BYTES
  })
  if (result.timedOut) {
    throw new Error(`git ${args.join(' ')} timed out`)
  }
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  if (result.outputTruncated) {
    throw new Error(`git ${args.join(' ')} produced more than ${GIT_MAX_OUTPUT_BYTES} bytes`)
  }
  return options.trim ? result.stdout.trim() : result.stdout
}

/** The repository NYA works on: the git top level of `start`, resolved to its real path. */
export async function resolveAeroNyaRepository(start: string): Promise<string> {
  let top: string
  try {
    top = await runAeroNyaGit(start, ['rev-parse', '--show-toplevel'], { trim: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`not inside a Git repository: ${reason}`)
  }
  return resolveAeroRepoRoot(top)
}
