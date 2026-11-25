// Reads a Territory Captain's live warm worker slots + context usage for automatic reuse/recycle guidance.
import type { Bot } from '../../shared/bot-types'
import { selectStructuredAgentContextUsage } from '../../shared/agent-session/conversation-context/structured-agent-session-context-usage'
import { formatWarmSlotTurnNote, type WarmSlotWorker } from '../../shared/bots/bot-warm-slot'
import { withTimeout } from '../../shared/concurrency/promise-timeout-fallback'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { resolveWorkerLineage } from '../runtime/orchestration/db/dispatch-context/worker-follow-up-lineage'
import {
  resolveStructuredWorkerIdentity,
  structuredWorkerSession
} from '../runtime/orchestration/terminal-authority/structured-sessions/structured-worker-authority'
import { BOT_ORCA_CLI } from './bot-preamble'
import { BOT_WORK_NOTE_TIMEOUT_MS } from './bot-work-record'
import { workspaceReader, type BotWorkRuntime } from './bot-work-runtime'
import { readWorkers } from './bot-work-workers-read'

const WARM_SLOT_DISPATCH_LIMIT = 12

async function readWorkerContextPercent(
  runtime: BotWorkRuntime,
  dispatchId: string
): Promise<number | null> {
  try {
    const db = runtime.getOrchestrationDb()
    const durable = db.getWorkerDispatch(dispatchId)
    const handle = durable?.agent_terminal_handle
    if (!handle) {
      return null
    }
    const identity = resolveStructuredWorkerIdentity(handle, db)
    if (!identity) {
      return null
    }
    const located = structuredWorkerSession(identity)
    if (located.kind !== 'here') {
      return null
    }
    runtime.ensureStructuredAgentSessionHost()
    const host = getStructuredAgentSessionHost()
    if (!host) {
      return null
    }
    const reads = await host.journalReads(located.sessionId)
    const raw = await reads.contextUsage()
    return selectStructuredAgentContextUsage([], raw)?.percentage ?? null
  } catch {
    return null
  }
}

async function readWarmSlots(
  runtime: BotWorkRuntime,
  bot: Pick<Bot, 'id' | 'role' | 'chatSessionId'>,
  sessionId: string
): Promise<WarmSlotWorker[]> {
  if (bot.role !== 'captain') {
    return []
  }
  const db = runtime.getOrchestrationDb()
  const sessionIds = new Set<string>([sessionId])
  if (bot.chatSessionId) {
    sessionIds.add(bot.chatSessionId)
  }
  const rawDispatchIds: string[] = []
  for (const id of sessionIds) {
    rawDispatchIds.push(...db.listDispatchIdsCreatedBySession(id, WARM_SLOT_DISPATCH_LIMIT))
  }
  if (rawDispatchIds.length === 0) {
    return []
  }
  // Collapse follow-up chains to each worker lineage's newest Dispatch.
  const latestIds = new Set<string>()
  for (const id of rawDispatchIds) {
    const latest = resolveWorkerLineage(db, id)?.latest
    latestIds.add(latest?.id ?? id)
  }
  const workers = await readWorkers(runtime, [...latestIds])
  const live = [...workers.values()].filter(
    (worker): worker is NonNullable<typeof worker> =>
      worker !== null &&
      worker.host === 'local' &&
      !worker.stopped &&
      worker.state !== 'stopped' &&
      worker.state !== 'unverifiable' &&
      worker.state !== 'failed'
  )
  if (live.length === 0) {
    return []
  }
  const readWorkspace = workspaceReader(runtime)
  return Promise.all(
    live.map(async (worker): Promise<WarmSlotWorker> => {
      const [workspace, contextPercent] = await Promise.all([
        readWorkspace(worker).catch(() => null),
        readWorkerContextPercent(runtime, worker.dispatchId)
      ])
      const ws = workspace && workspace !== 'gone' ? workspace : null
      return {
        dispatchId: worker.dispatchId,
        title: worker.title,
        agent: worker.agent,
        state: worker.state,
        idle: worker.idle,
        workspaceName: ws?.name ?? null,
        branch: ws?.branch ?? null,
        startedAt: worker.startedAt,
        contextPercent
      }
    })
  )
}

/** Live warm-slot guidance for a Territory Captain's turn, bounded by BOT_WORK_NOTE_TIMEOUT_MS. */
export async function readCaptainWarmSlotNote(
  runtime: BotWorkRuntime,
  bot: Pick<Bot, 'id' | 'role' | 'chatSessionId'> | undefined,
  sessionId: string
): Promise<string | null> {
  if (!bot || bot.role !== 'captain') {
    return null
  }
  const slots = await withTimeout(
    readWarmSlots(runtime, bot, sessionId).catch(() => []),
    BOT_WORK_NOTE_TIMEOUT_MS,
    []
  )
  return formatWarmSlotTurnNote(slots, BOT_ORCA_CLI)
}
