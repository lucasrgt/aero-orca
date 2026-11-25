import * as z from 'zod'
import type { NativeChatAgent } from '../agent-launch/permissions/agent-chat-permission-support'
import { BOT_AGENT_SUCCESSORS, BOT_RETIRED_AGENTS, isBotRetiredAgent } from './bot-retired-agents'

/** Native-chat agents a bot cannot run on yet; each waits on a live check of its preamble delivery. */
export const BOT_HELD_BACK_AGENTS = [] as const

/** Bots run in a native chat; every native-chat agent but the held-back ones. */
export const BOT_AGENTS = [
  'claude',
  'codex',
  'grok',
  'opencode',
  'omp',
  'pi',
  'antigravity',
  'cursor',
  'hermes',
  'copilot',
  'opencode2',
  'kimi',
  'kiro',
  'aug',
  'goose',
  'kilo',
  'mimo-code',
  'droid',
  'qwen-code',
  'cline',
  'devin',
  'codebuddy'
] as const satisfies readonly Exclude<NativeChatAgent, (typeof BOT_HELD_BACK_AGENTS)[number]>[]

/** A bot agent as old records and peers name it: a retired agent reads as its successor. */
export const BotAgentReadSchema = z
  .enum([...BOT_AGENTS, ...BOT_RETIRED_AGENTS])
  .transform((agent): BotAgent => (isBotRetiredAgent(agent) ? BOT_AGENT_SUCCESSORS[agent] : agent))

export type BotAgent = (typeof BOT_AGENTS)[number]

export function isBotAgent(agent: string): agent is BotAgent {
  return BOT_AGENTS.some((entry) => entry === agent)
}
