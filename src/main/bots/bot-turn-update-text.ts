import type { BotContextChange } from '../../shared/bots/bot-context-note'
import type { BotHomeFiles } from './bot-preamble'
import type { BotTurnGiven } from './bot-turn-given'
import {
  type BotMemoryTopics,
  botMemoryTopicsUpdateText,
  botMemoryUpdateText,
  botSoulUpdateText,
  botTurnFingerprint
} from './bot-turn-memory-update'

/** The sections a turn's context update carries, in order, with the empty ones left out. */
export function botTurnUpdateText(sections: readonly (string | null | undefined)[]): string {
  return sections.filter(Boolean).join('\n\n')
}

/** What SOUL.md, MEMORY.md and memory/ now hold against what the agent was last given of them. */
export function botHomeFilesUpdate(
  entry: BotTurnGiven,
  files: BotHomeFiles,
  topics: BotMemoryTopics
): {
  soul: string
  memory: string
  soulNow: string | null
  memoryNow: string | null
  topicsNow: string | null
  changed: BotContextChange[]
} {
  const soul = botTurnFingerprint(files.soul)
  const memory = botTurnFingerprint(files.memory)
  const memoryNow =
    memory !== entry.memory ? botMemoryUpdateText(entry.memoryText, files.memory) : null
  const topicsNow = entry.topics ? botMemoryTopicsUpdateText(entry.topics, topics) : null
  const changed: BotContextChange[] = [
    ...(soul !== entry.soul ? ['soul' as const] : []),
    ...(memoryNow || topicsNow ? ['memory' as const] : [])
  ]
  const soulNow = soul !== entry.soul ? botSoulUpdateText(files.soul) : null
  return { soul, memory, soulNow, memoryNow, topicsNow, changed }
}
