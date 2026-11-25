import { join } from 'node:path'
import { proposalSoul } from '../../shared/bots/bot-proposal'
import type { BotCreateParams } from '../../shared/rpc-contract/bots-params'
import type { BotHomeFilesystem } from './bot-home'

function soulFileText(soul: string): string {
  return `${soul.trimEnd()}\n`
}

/** A new bot's SOUL.md: the soul it was given, else one drawn from its seed, else the home's default. */
export function newBotSoulText(name: string, input: BotCreateParams): string | undefined {
  if (input.soul !== undefined) {
    return soulFileText(input.soul)
  }
  return input.seed ? proposalSoul(name, input.seed) : undefined
}

/** An edit's new SOUL.md, written over the bot's home one. */
export async function writeBotSoulFile(
  fs: Pick<BotHomeFilesystem, 'writeText'>,
  homeFolder: string,
  soul: string
): Promise<void> {
  await fs.writeText(join(homeFolder, 'SOUL.md'), soulFileText(soul))
}
