import { type BotMemoryChange, isEmptyBotMemoryChange } from '../../shared/bot-memory-lines'
import type { BotMemoryRecord } from './bot-memory-record'
import type { BotTurnGiven } from './bot-turn-given'

/** The session's entry as it stands when a turn's MEMORY.md change proves to be the bot's own, else null. */
export async function ownMemoryEdit({
  memoryAtStart,
  memory,
  kept,
  edited,
  alone,
  current,
  record,
  botId,
  sessionId
}: {
  /** The file's fingerprint when the turn started. */
  memoryAtStart: string | null
  /** The file's fingerprint now. */
  memory: string
  /** What the turn's end put back or kept out. */
  kept: BotMemoryChange
  edited: boolean
  alone: () => Promise<boolean>
  current: () => BotTurnGiven
  record: Pick<BotMemoryRecord, 'changedBesides'>
  botId: string
  sessionId: string
}): Promise<BotTurnGiven | null> {
  // Only a file the turn changed has anything to take; an unchanged one is already had.
  const changed =
    memoryAtStart !== null &&
    memory !== memoryAtStart &&
    // Not when facts were put back or kept out: its next turn is sent them.
    isEmptyBotMemoryChange(kept) &&
    edited
  const ranAlone = changed && (await alone())
  const now = current()
  const own =
    ranAlone &&
    now.memory !== null &&
    // The file at the turn's start was what the agent had.
    memoryAtStart === now.memory &&
    // This chat's own record changes (its Forget, its turn ends) are not another writer's.
    !record.changedBesides(botId, sessionId, now.memoryRecord)
  return own ? now : null
}
