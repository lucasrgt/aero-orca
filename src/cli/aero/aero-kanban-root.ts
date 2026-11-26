import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { resolveAeroRepoRoot } from '../../main/aero/aero-workspace-files'
import { hasAerofortressDir } from './aero-knowledge-root'
import { runAeroNyaGit } from './aero-nya-git'

function comparable(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

async function gitPath(root: string, flag: string): Promise<string> {
  return resolve(root, await runAeroNyaGit(root, ['rev-parse', flag], { trim: true }))
}

/**
 * Kanban boards are shared work state, not branch state: from inside a linked git worktree the tools
 * must read and write the boards of the repo's PRIMARY checkout (the parent of the common git dir),
 * at the same place inside it, or every worktree would fork its own copy of the board. The primary is
 * used only while it holds `.aerofortress`; a bare repo, a submodule, a plain folder or a primary
 * without it keep `root` (the nearest `.aerofortress` at or above the start).
 */
export async function resolveAeroKanbanRoot(given: string): Promise<string> {
  const root = await resolveAeroRepoRoot(given)
  let commonDirectory: string
  let topLevel: string
  try {
    commonDirectory = await gitPath(root, '--git-common-dir')
    topLevel = await resolveAeroRepoRoot(await gitPath(root, '--show-toplevel'))
  } catch {
    return root
  }
  const inside = relative(topLevel, root)
  if (basename(commonDirectory) !== '.git' || inside.startsWith('..') || isAbsolute(inside)) {
    return root
  }
  const primary = await resolveAeroRepoRoot(join(dirname(commonDirectory), inside))
  if (comparable(primary) === comparable(root) || !(await hasAerofortressDir(primary))) {
    return root
  }
  return primary
}
