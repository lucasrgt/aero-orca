import { isAbsolute, join, relative, resolve } from 'node:path'
import { resolveAeroRepoRoot } from '../../main/aero/aero-workspace-files'
import { hasAerofortressDir } from './aero-knowledge-root'
import { runAeroNyaGit } from './aero-nya-git'

function comparable(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

/** The main working tree: git lists it first; a bare repository has none to use. */
async function mainWorktree(root: string): Promise<string | undefined> {
  const listing = await runAeroNyaGit(root, ['worktree', 'list', '--porcelain'])
  const first = listing.split(/\r?\n\r?\n/)[0]?.split(/\r?\n/) ?? []
  const path = first.find((line) => line.startsWith('worktree '))?.slice('worktree '.length)
  return path === undefined || first.includes('bare') ? undefined : resolve(root, path)
}

/**
 * Kanban boards are shared work state, not branch state: from inside a linked git worktree the tools
 * must read and write the boards of the repo's PRIMARY checkout (the first entry of `git worktree
 * list`), at the same place inside it, or every worktree would fork its own copy of the board. The
 * primary is used only while it holds `.aerofortress`; a bare repo, a submodule, a plain folder or a
 * primary without it keep `root` (the nearest `.aerofortress` at or above the start).
 */
export async function resolveAeroKanbanRoot(given: string): Promise<string> {
  const root = await resolveAeroRepoRoot(given)
  let main: string | undefined
  let topLevel: string
  try {
    main = await mainWorktree(root)
    topLevel = await resolveAeroRepoRoot(
      resolve(root, await runAeroNyaGit(root, ['rev-parse', '--show-toplevel'], { trim: true }))
    )
  } catch {
    return root
  }
  const inside = relative(topLevel, root)
  if (main === undefined || inside.startsWith('..') || isAbsolute(inside)) {
    return root
  }
  const primary = await resolveAeroRepoRoot(join(main, inside))
  if (comparable(primary) === comparable(root) || !(await hasAerofortressDir(primary))) {
    return root
  }
  return primary
}
