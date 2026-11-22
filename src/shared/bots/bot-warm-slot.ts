import type { OrchestrationSessionWorkerState } from '../orchestration-session-workers'

/** Past this share of a warm worker's context window, advise a Lazuli-style handoff + recycle. */
export const WARM_SLOT_RECYCLE_PERCENT = 72

export type WarmSlotWorker = {
  dispatchId: string
  title: string
  agent: string | null
  state: OrchestrationSessionWorkerState
  idle?: boolean
  workspaceName: string | null
  branch: string | null
  startedAt: number
  /** Rounded percentage of the worker's context window currently used, or null if unread. */
  contextPercent: number | null
}

export type WarmSlotRecommendation =
  | { kind: 'reuse'; worker: WarmSlotWorker; busyCount: number }
  | { kind: 'recycle'; worker: WarmSlotWorker; busyCount: number }
  | { kind: 'busy'; worker: WarmSlotWorker; busyCount: number }

function cleanSlotText(text: string): string {
  return text
    .replace(/[[\]`"\s]+/g, ' ')
    .trim()
    .slice(0, 96)
}

function isReusableWarmSlot(worker: WarmSlotWorker): boolean {
  return worker.state === 'completed' || (worker.state === 'working' && worker.idle === true)
}

function isBusyWarmSlot(worker: WarmSlotWorker): boolean {
  return worker.state === 'working' && worker.idle !== true
}

/** Picks the best warm territory slot: lightest reusable slot first, else busiest indicator. */
export function selectWarmSlotRecommendation(
  workers: readonly WarmSlotWorker[]
): WarmSlotRecommendation | null {
  const busy = workers.filter(isBusyWarmSlot)
  const reusable = workers.filter(isReusableWarmSlot)
  if (reusable.length > 0) {
    // Prefer the freshest/lightest context slot; tie-break by newest start.
    const sorted = [...reusable].sort((a, b) => {
      const pctA = a.contextPercent ?? -1
      const pctB = b.contextPercent ?? -1
      if (pctA !== pctB) {
        return pctA - pctB
      }
      return b.startedAt - a.startedAt
    })
    const best = sorted[0]!
    if (best.contextPercent !== null && best.contextPercent >= WARM_SLOT_RECYCLE_PERCENT) {
      return { kind: 'recycle', worker: best, busyCount: busy.length }
    }
    return { kind: 'reuse', worker: best, busyCount: busy.length }
  }
  if (busy.length > 0) {
    const newest = [...busy].sort((a, b) => b.startedAt - a.startedAt)[0]!
    return { kind: 'busy', worker: newest, busyCount: busy.length }
  }
  return null
}

function describeSlot(worker: WarmSlotWorker): string {
  const parts: string[] = [`dispatch:${worker.dispatchId}`]
  const details: string[] = []
  if (worker.title.trim()) {
    details.push(`"${cleanSlotText(worker.title)}"`)
  }
  if (worker.workspaceName?.trim()) {
    const branch = worker.branch?.trim() ? ` (${cleanSlotText(worker.branch)})` : ''
    details.push(`in ${cleanSlotText(worker.workspaceName)}${branch}`)
  }
  if (worker.contextPercent !== null) {
    details.push(`context ~${worker.contextPercent}%`)
  }
  return details.length > 0 ? `${parts[0]} (${details.join(', ')})` : parts[0]!
}

/** Turn-level guidance telling a Territory Captain which warm worker slot to reuse or recycle. */
export function formatWarmSlotTurnNote(
  workers: readonly WarmSlotWorker[],
  orcaCli: string
): string | null {
  const pick = selectWarmSlotRecommendation(workers)
  if (!pick) {
    return null
  }
  const slot = describeSlot(pick.worker)
  const sendCmd = `\`${orcaCli} orchestration send --to dispatch:${pick.worker.dispatchId} --body "..."\``
  const parallelNote =
    pick.busyCount > 0
      ? ` (${pick.busyCount} other ${pick.busyCount === 1 ? 'worker is' : 'workers are'} currently busy.)`
      : ''

  if (pick.kind === 'recycle') {
    return `[Orca warm slot — RECYCLE RECOMMENDED: territory worker ${slot} is near context saturation.${parallelNote} Ask it for a brief handoff summary (files, decisions, open pitfalls) with ${sendCmd}, record durable takeaways in MEMORY.md, then start a fresh worker (\`${orcaCli} orchestration worker-start --worktree new-child ...\`) for the next task.]`
  }

  if (pick.kind === 'reuse') {
    return `[Orca warm slot: territory worker ${slot} is warm and idle.${parallelNote} Reuse it for this territory task with ${sendCmd} to keep prompt cache warm and avoid cold-start overhead; start a second worker (\`--worktree new-child\`) only if you need parallel execution or a separate branch.]`
  }

  return `[Orca warm slot: territory worker ${slot} is currently busy.${pick.busyCount > 1 ? ` (${pick.busyCount} workers running.)` : ''} Follow up on it if this belongs to the same task, or start a parallel worker slot (\`${orcaCli} orchestration worker-start --worktree new-child ...\`) if this is independent work.]`
}
