import { lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

async function isDirectory(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null))?.isDirectory() ?? false
}

/** Whether `cwd` sits in a repo that carries AeroFortress data: `.aerofortress` or `.nya` at or above it. */
export async function hasAeroAgentData(cwd: string): Promise<boolean> {
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    if (
      (await isDirectory(join(directory, '.aerofortress'))) ||
      (await isDirectory(join(directory, '.nya')))
    ) {
      return true
    }
    if (dirname(directory) === directory) {
      return false
    }
  }
}
