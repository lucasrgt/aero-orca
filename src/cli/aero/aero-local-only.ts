import { rejectRemoteSelectionFlags } from '../dispatch/remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime/connection/types'

/**
 * `orca aero` commands read the disk of the machine that runs them. Why refuse a bridged shell: there
 * the CLI runs on the Orca host, so `--path` would name the wrong machine's files.
 */
export function assertAeroLocalExecution(
  flags: ReadonlyMap<string, string | boolean>,
  command: string,
  why: string
): void {
  rejectRemoteSelectionFlags(flags, `${command}; ${why}`)
  if (process.env.ORCA_CLI_CWD) {
    throw new RuntimeClientError(
      'invalid_environment',
      `${command} reads the files of the machine that runs it, but this shell forwards orca to the Orca host. Run the command on the Orca host, or use the repo on this machine directly.`
    )
  }
}

export function readAeroPathFlag(flags: ReadonlyMap<string, string | boolean>): string | undefined {
  const pathFlag = flags.get('path')
  if (typeof pathFlag === 'boolean' || pathFlag === '') {
    throw new RuntimeClientError('invalid_argument', 'Missing <path> for --path.')
  }
  return pathFlag
}
