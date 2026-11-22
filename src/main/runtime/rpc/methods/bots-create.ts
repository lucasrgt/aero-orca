// `bots.create`: create a bot on this host (desktop, phone, or owner CLI/chat).
import { BotCreate } from '../../../../shared/rpc-contract/bots-params'
import { botFirstKickoff } from '../../../../shared/bots/bot-import'
import { botMadeForWorkspacesKickoff } from '../../../../shared/bots/bot-made-for-workspaces'
import { runtimeBotChats } from '../../../bots/bot-chat-session'
import { createBotFromShare } from '../../../bots/sharing/bot-share-create'
import { botTemplateCreation, createBotFromTemplate } from '../../../bots/bot-template-create'
import { botShareCreateDeps } from './bots-share-create-deps'
import { defineMethod, InvalidArgumentError } from '../core'

export const BOT_CREATE_METHOD = defineMethod({
  name: 'bots.create',
  permission: 'workspace',
  params: BotCreate,
  handler: async (
    { handOff, takingOver, skipKickoff, fromOffer, fromShare, fromTemplate, ...params },
    context
  ) => {
    const { runtime } = context
    runtime.bots.assertEnabled()
    let bot
    if (fromShare) {
      bot = await createBotFromShare(botShareCreateDeps(runtime), { ...params, fromShare })
    } else if (fromOffer) {
      if (!runtime.bots.list().some((entry) => entry.id === fromOffer.botId)) {
        throw new InvalidArgumentError('The bot that proposed this bot is gone.')
      }
      // A template offer is still made once per card, its package installed in that same step.
      const template = fromTemplate
        ? botTemplateCreation(botShareCreateDeps(runtime), { ...params, fromTemplate })
        : null
      const made = await runtime.bots.createFromOffer(
        { ...(template?.params ?? params), fromOffer },
        template?.origin,
        template?.finish
      )
      if (made.existing) {
        // Already created from this card (another window, or Create and Edit at once): that bot,
        // with no second first turn.
        if (!made.bot) {
          throw new InvalidArgumentError('A bot was already created from that card, then deleted.')
        }
        return { bot: made.bot }
      }
      bot = made.bot!
    } else if (fromTemplate) {
      bot = await createBotFromTemplate(botShareCreateDeps(runtime), { ...params, fromTemplate })
    } else {
      bot = await runtime.bots.create(params)
    }
    // Made in Hand to bot or created with skipKickoff: skip the default first-run greeting turn.
    if (takingOver || skipKickoff) {
      return { bot }
    }
    // The bot speaks first: its first-run rules turn this into a greeting. Made for workspaces, it then
    // offers to take them over; made from another app's bot, its first turn brings that bot over; made
    // from a link, it says whose; made from a template, it says which.
    const first = runtimeBotChats(runtime).sendToChat(
      bot.id,
      handOff ? botMadeForWorkspacesKickoff(handOff) : botFirstKickoff(bot),
      'bot-created'
    )
    first.catch((error: unknown) => console.warn('[bots] first-run kickoff failed:', error))
    return { bot }
  }
})
