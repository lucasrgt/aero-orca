import { basename, join } from 'node:path'
import { parseAeroNyaScar, type AeroNyaScar } from '../../shared/aero/aero-nya'
import { renderAeroNyaScarToml } from '../../shared/aero/aero-nya-scar-format'
import { assertValidAeroNyaScar } from '../../shared/aero/aero-nya-remember'
import type { AeroIssue } from '../../shared/aero/aero-workspace-snapshot'
import {
  listFiles,
  probeDirectory,
  readGuardedFile,
  toRepoRelativePath
} from '../../main/aero/aero-workspace-files'
import { writeAeroGuardedFile } from './aero-item-file-writer'

const NYA_FOLDERS = ['.nya', 'scars']
const NOT_INITIALIZED = 'is not initialized; run nya init'

/** A scar with the file it came from, so an appended occurrence goes back to that very file. */
export type AeroNyaStoredScar = { scar: AeroNyaScar; fileName: string }

function scarsDirectory(root: string): string {
  return join(root, ...NYA_FOLDERS)
}

/**
 * Every scar of the repo in file-name order. All or nothing like not-you-again: one unreadable,
 * invalid or symlinked scar fails the whole read, so a gate never runs on a silently thinner set.
 */
export async function readAeroNyaScars(root: string): Promise<AeroNyaStoredScar[]> {
  const directory = scarsDirectory(root)
  const probed = await probeDirectory(root, directory)
  if (probed.status === 'missing') {
    throw new Error(`${root} ${NOT_INITIALIZED}`)
  }
  if (probed.status === 'skipped') {
    throw new Error(`.nya/scars ${probed.reason}`)
  }
  const issues: AeroIssue[] = []
  const files = await listFiles(root, directory, '.toml', false, issues)
  if (issues.length > 0) {
    throw new Error(`invalid scar ${issues[0].path}: ${issues[0].reason}`)
  }
  const scars: AeroNyaStoredScar[] = []
  for (const file of files) {
    const path = toRepoRelativePath(root, file)
    const read = await readGuardedFile(root, file)
    if (read.status !== 'read') {
      throw new Error(
        `invalid scar ${path}: ${read.status === 'skipped' ? read.reason : 'disappeared while reading'}`
      )
    }
    const parsed = parseAeroNyaScar(read.text)
    if (!parsed.ok) {
      throw new Error(`invalid scar ${path}: ${parsed.issues.join('; ')}`)
    }
    scars.push({ scar: parsed.value, fileName: basename(file) })
  }
  return scars
}

/**
 * Writes one scar atomically under `.nya/scars`. `create` is a new scar (`<id>.toml`, never over a
 * file); `replace` rewrites the file the scar was read from.
 */
export async function writeAeroNyaScar(
  root: string,
  scar: AeroNyaScar,
  target: { mode: 'create' } | { mode: 'replace'; fileName: string }
): Promise<void> {
  assertValidAeroNyaScar(scar)
  const probed = await probeDirectory(root, scarsDirectory(root))
  if (probed.status !== 'ok') {
    throw new Error(`${root} ${NOT_INITIALIZED}`)
  }
  const fileName = target.mode === 'create' ? `${scar.id}.toml` : target.fileName
  await writeAeroGuardedFile(
    root,
    NYA_FOLDERS,
    [],
    fileName,
    renderAeroNyaScarToml(scar),
    target.mode
  )
}
