// Direct bot inspection and messaging RPCs (`bots.show`, `bots.send`) for CLI and paired clients.
import { join } from 'node:path'
import { BotSend, BotShow } from '../../../../shared/rpc-contract/bots-params'
import { botHomeFolder, localBotHomeFilesystem } from '../../../bots/bot-home'
import { runtimeBotChats } from '../../../bots/bot-chat-session'
import { defineMethod, InvalidArgumentError } from '../core'

export const BOT_MANAGE_METHODS = [
  defineMethod({
    name: 'bots.show',
    permission: 'workspace',
    params: BotShow,
    handler: async (params, { runtime }) => {
      const bot = runtime.bots.list().find((entry) => entry.id === params.botId)
      if (!bot) {
        throw new InvalidArgumentError('bot_not_found')
      }
      const homeFolder = botHomeFolder(bot)
      const [soul, memory] = await Promise.all([
        localBotHomeFilesystem.readText(join(homeFolder, 'SOUL.md')),
        localBotHomeFilesystem.readText(join(homeFolder, 'MEMORY.md'))
      ])
      return { bot, homeFolder, soul, memory }
    }
  }),
  defineMethod({
    name: 'bots.send',
    permission: 'workspace',
    params: BotSend,
    handler: async (params, { runtime }) => {
      runtime.bots.assertEnabled()
      const bot = runtime.bots.list().find((entry) => entry.id === params.botId)
      if (!bot) {
        throw new InvalidArgumentError('bot_not_found')
      }
      const chats = runtimeBotChats(runtime)
      const delivered = params.sessionId
        ? await chats.sendToSession(bot.id, params.sessionId, params.message)
        : await chats.sendToChat(bot.id, params.message)
      return {
        botId: bot.id,
        sessionId: delivered.sessionId,
        outcome: delivered.outcome
      }
    }
  })
]
