import { resolve } from 'node:path'
import { readAeroWorkspace } from '../../main/aero/aero-workspace-reader'
import { summarizeAeroSnapshot } from '../../shared/aero/aero-workspace-snapshot'
import type { CommandHandler } from '../dispatch/dispatch'
import { assertAeroLocalExecution, readAeroPathFlag } from './aero-local-only'
import { formatAeroSnapshotSummary } from './aero-inspect-format'

export const AERO_HANDLERS: Record<string, CommandHandler> = {
  // Runtime-free: needs no running Orca.
  'aero inspect': async ({ flags, cwd, json }) => {
    assertAeroLocalExecution(flags, 'orca aero inspect', 'it reads local files')
    const pathFlag = readAeroPathFlag(flags)
    const summary = summarizeAeroSnapshot(await readAeroWorkspace(resolve(cwd, pathFlag ?? '.')))
    console.log(json ? JSON.stringify(summary, null, 2) : formatAeroSnapshotSummary(summary))
  }
}
