import { resolve } from 'node:path'
import { readAeroWorkspace } from '../../main/aero/aero-workspace-reader'
import { summarizeAeroSnapshot } from '../../shared/aero/aero-workspace-snapshot'
import type { CommandHandler } from '../dispatch/dispatch'
import { rejectRemoteSelectionFlags } from '../dispatch/remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime/connection/types'
import { formatAeroSnapshotSummary } from './aero-inspect-format'

export const AERO_HANDLERS: Record<string, CommandHandler> = {
  // Runtime-free: needs no running Orca, but reads the disk of the machine that runs it. Why refuse a
  // bridged shell: there the CLI runs on the Orca host, so `--path` would name the wrong machine's files.
  'aero inspect': async ({ flags, cwd, json }) => {
    rejectRemoteSelectionFlags(flags, 'orca aero inspect; it reads local files')
    if (process.env.ORCA_CLI_CWD) {
      throw new RuntimeClientError(
        'invalid_environment',
        'orca aero inspect reads the files of the machine that runs it, but this shell forwards orca to the Orca host. Run the command on the Orca host, or inspect the repo on this machine directly.'
      )
    }
    const pathFlag = flags.get('path')
    if (typeof pathFlag === 'boolean' || pathFlag === '') {
      throw new RuntimeClientError('invalid_argument', 'Missing <path> for --path.')
    }
    const summary = summarizeAeroSnapshot(await readAeroWorkspace(resolve(cwd, pathFlag ?? '.')))
    console.log(json ? JSON.stringify(summary, null, 2) : formatAeroSnapshotSummary(summary))
  }
}
