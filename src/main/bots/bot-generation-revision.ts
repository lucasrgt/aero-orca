import type { RuntimeStore } from '../runtime/construction/runtime-store-contract'
import type { BotPictureRevision } from '../../shared/bot-avatar'
import { requireBotStore, requireStoredBot } from './bot-controller-store'
import { knownBotPicture, readBotHomePicture } from './bot-avatar-revision'
import type { BotHomeFilesystem } from './bot-home'

type BotGenerationDependencies = {
  getStore: () => RuntimeStore | null
  notifyBotsWritten: (catalogChanged: boolean) => void
  botsRoot: () => string
  filesystem: BotHomeFilesystem
}

/** A fresh Generate can recover a lost profile save. A concurrent catalog change keeps its original guard. */
export async function botGenerationRevision(
  deps: BotGenerationDependencies,
  serialize: <T>(work: () => Promise<T>) => Promise<T>,
  botId: string,
  seen: number,
  epoch?: string
): Promise<BotPictureRevision> {
  const store = requireBotStore(deps.getStore())
  const listed = requireStoredBot(store, botId)
  const home = await readBotHomePicture(deps, listed)
  return serialize(async () => {
    const currentStore = requireBotStore(deps.getStore())
    const current = requireStoredBot(currentStore, botId)
    if (
      current !== listed ||
      (listed.avatarRevision ?? 0) !== seen ||
      listed.avatarRevisionEpoch !== epoch
    ) {
      return { revision: seen, epoch }
    }
    const bot = knownBotPicture(home)
    if (listed !== bot) {
      currentStore.saveBot(bot)
      deps.notifyBotsWritten(false)
    }
    return { revision: bot.avatarRevision ?? 0, epoch: bot.avatarRevisionEpoch }
  })
}
