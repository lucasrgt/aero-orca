import { lstat, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { probeDirectory } from '../../main/aero/aero-workspace-files'
import { runAeroNyaGit } from './aero-nya-git'

const LOCK_FOLDER = 'aero-nya'

/**
 * The folder for the NYA scars lock: `aero-nya` inside the repo's common git dir, shared by every
 * worktree and outside the work tree, so no lock file can be left for `git status` to show. A repo
 * without `.nya` is not initialized and gets no lock folder.
 */
export async function prepareAeroNyaLockDirectory(root: string): Promise<string> {
  const store = await probeDirectory(root, join(root, '.nya'))
  if (store.status !== 'ok') {
    throw new Error(
      `.nya ${store.status === 'skipped' ? store.reason : 'does not exist; this repository is not initialized (run nya init)'}`
    )
  }
  const gitDirectory = resolve(
    root,
    await runAeroNyaGit(root, ['rev-parse', '--git-common-dir'], { trim: true })
  )
  const directory = join(gitDirectory, LOCK_FOLDER)
  await mkdir(directory, { recursive: true })
  const entry = await lstat(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`${LOCK_FOLDER} in the git directory is not a real directory; cannot lock`)
  }
  return directory
}
