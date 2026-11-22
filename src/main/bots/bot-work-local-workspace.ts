import { access } from 'node:fs/promises'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../shared/execution-host/execution-host'
import { splitWorktreeId } from '../../shared/worktree/id'
import { parseWslUncPath } from '../../shared/file-access/wsl-paths'
import { readWorkspaceReviewPR } from '../../shared/sidebar-list/feed-facts/workspace-review-facts'
import type { BotWorkRuntime } from './bot-work-runtime'
import type { BotWorkWorkspace } from './bot-work-record'

const pathExists = (path: string): Promise<boolean> =>
  access(path)
    .then(() => true)
    .catch(() => false)

/** One of this host's worktrees as the work record reads it; 'gone' only with proof. */
export async function readLocalWorkspace(
  runtime: Pick<BotWorkRuntime, 'linkStore' | 'showManagedTerminalWorkspace'>,
  worktreeId: string
): Promise<BotWorkWorkspace | 'gone' | null> {
  const store = runtime.linkStore()
  const parsed = splitWorktreeId(worktreeId)
  if (!store || !parsed) {
    return null
  }
  const repo = store.getRepos().find((entry) => entry.id === parsed.repoId)
  if (!repo) {
    return null
  }
  // Only this machine's own disk proves a deletion, with the repository still there: an SSH host,
  // a stopped WSL distro or an unmounted drive proves nothing.
  if (
    getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID &&
    !parseWslUncPath(parsed.worktreePath) &&
    (await pathExists(repo.path)) &&
    !(await pathExists(parsed.worktreePath))
  ) {
    return 'gone'
  }
  const worktree = await runtime.showManagedTerminalWorkspace(`id:${worktreeId}`)
  // The PR the workspace's row shows: the desktop's cached read, never a GitHub call of its own.
  const pr = readWorkspaceReviewPR(worktree, repo, store.getGitHubCache().pr)
  return {
    name: worktree.displayName || worktree.branch,
    branch: worktree.branch || null,
    head: worktree.head,
    pullRequest: pr
      ? {
          number: pr.number,
          url: pr.url,
          state: pr.state,
          checks: pr.checksStatus,
          review: pr.reviewDecision ?? null,
          headSha: pr.headSha ?? null
        }
      : null
  }
}
