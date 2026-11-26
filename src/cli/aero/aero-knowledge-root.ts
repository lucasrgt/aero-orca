import { lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveAeroRepoRoot } from '../../main/aero/aero-workspace-files'

async function hasAerofortressDir(directory: string): Promise<boolean> {
  const entry = await lstat(join(directory, '.aerofortress')).catch(() => null)
  return entry?.isDirectory() ?? false
}

/**
 * The repo the knowledge server is rooted at: the nearest directory at or above `start` that holds
 * `.aerofortress`. With none, an explicit `--path` is trusted as given (a store creates the folder
 * there); an implicit cwd is an error, so an agent never seeds a network in a random subfolder.
 */
export async function resolveAeroKnowledgeRoot(start: string, explicit: boolean): Promise<string> {
  const origin = await resolveAeroRepoRoot(resolve(start))
  for (let directory = origin; ; directory = dirname(directory)) {
    if (await hasAerofortressDir(directory)) {
      return directory
    }
    if (dirname(directory) === directory) {
      break
    }
  }
  if (explicit) {
    return origin
  }
  throw new Error(
    `no .aerofortress directory found at or above ${origin}; run from inside an AeroFortress repo or pass --path <repo>`
  )
}
