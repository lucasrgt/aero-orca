// Direct bot inspection, update, deletion, agent discovery, and messaging CLI commands.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Bot, BotAgent } from '../../shared/bot-types'
import type { BotToolProblem, BotTools } from '../../shared/bot-tools'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import { getOptionalStringFlag } from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/connection/types'
import { callBots, findBot, formatBot } from './bot'
import { parseBotAgentFlag, parseBotPermissionModeFlag, readSoulFlags } from './bot-create'
import { formatBotTools } from './bot-tools'

type BotShowPayload = {
  bot: Bot
  homeFolder: string
  soul: string | null
  memory: string | null
}

type BotToolsListPayload = {
  tools: BotTools
  problems?: Record<string, BotToolProblem>
}

function requireBotSelector(flags: Map<string, string | boolean>): string {
  const selector = getOptionalStringFlag(flags, 'bot')
  if (!selector) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Missing bot name or id (pass <bot> or --bot <name>).'
    )
  }
  return selector
}

function formatBotShow(payload: BotShowPayload, toolsResult: BotToolsListPayload | null): string {
  const { bot, homeFolder, soul, memory } = payload
  const lines = [
    formatBot(bot),
    `Home: ${homeFolder}`,
    ...(bot.project ? [`Project: ${bot.project}`] : []),
    ...(bot.launch?.model ? [`Model: ${bot.launch.model}`] : []),
    ...(bot.permissionMode ? [`Permission: ${bot.permissionMode}`] : []),
    ...(bot.avatar
      ? [`Avatar: ${bot.avatar}${bot.avatarColor ? ` (${bot.avatarColor})` : ''}`]
      : []),
    ...(bot.lookAround
      ? [
          `Look around: ${bot.lookAround.on ? 'on' : 'off'} (${bot.lookAround.every}${bot.lookAround.focus ? `, focus: ${bot.lookAround.focus}` : ''})`
        ]
      : []),
    ...(bot.tidyUp ? [`Tidy up: ${bot.tidyUp.on ? 'on' : 'off'} (${bot.tidyUp.every})`] : [])
  ]
  if (toolsResult) {
    lines.push('', 'Tools:', formatBotTools(toolsResult.tools, toolsResult.problems))
  }
  if (soul?.trim()) {
    lines.push('', 'SOUL.md:', soul.trim())
  }
  if (memory?.trim()) {
    lines.push('', 'MEMORY.md:', memory.trim())
  }
  return lines.join('\n')
}

async function readMessageFlags(
  flags: Map<string, string | boolean>,
  cwd: string
): Promise<string> {
  const inline = getOptionalStringFlag(flags, 'message')
  const filePath = getOptionalStringFlag(flags, 'message-file')
  if (inline !== undefined && filePath !== undefined) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass either --message or --message-file, not both.'
    )
  }
  const text = filePath !== undefined ? await readFile(resolve(cwd, filePath), 'utf8') : inline
  if (!text?.trim()) {
    throw new RuntimeClientError('invalid_argument', 'Missing --message (or --message-file).')
  }
  return text
}

async function handleBotShow({ flags, client, json }: HandlerContext): Promise<void> {
  const target = await findBot(client, requireBotSelector(flags))
  const [profile, tools] = await Promise.all([
    callBots<BotShowPayload>(client, 'bots.show', { botId: target.id }),
    callBots<BotToolsListPayload>(client, 'bots.tools.list', { botId: target.id }).catch(() => null)
  ])
  if (json) {
    printResult(
      {
        ...profile,
        result: {
          ...profile.result,
          ...(tools ? { tools: tools.result.tools, toolProblems: tools.result.problems ?? {} } : {})
        }
      },
      true,
      () => ''
    )
    return
  }
  printResult(profile, false, (value) => formatBotShow(value, tools?.result ?? null))
}

async function handleBotUpdate({ flags, client, cwd, json }: HandlerContext): Promise<void> {
  const target = await findBot(client, requireBotSelector(flags))
  const pause = flags.has('pause')
  const resume = flags.has('resume')
  if (pause && resume) {
    throw new RuntimeClientError('invalid_argument', 'Pass either --pause or --resume, not both.')
  }
  const model = getOptionalStringFlag(flags, 'model')
  const clearModel = flags.has('clear-model')
  if (model !== undefined && clearModel) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass either --model or --clear-model, not both.'
    )
  }
  const name = getOptionalStringFlag(flags, 'name')
  const agent = parseBotAgentFlag(getOptionalStringFlag(flags, 'agent'))
  const permissionMode = parseBotPermissionModeFlag(getOptionalStringFlag(flags, 'permission-mode'))
  const avatar = getOptionalStringFlag(flags, 'avatar')
  const avatarColor = getOptionalStringFlag(flags, 'avatar-color')
  const project = getOptionalStringFlag(flags, 'project')
  const clearProject = flags.has('clear-project')
  if (project !== undefined && clearProject) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass either --project or --clear-project, not both.'
    )
  }
  const soul = await readSoulFlags(flags, cwd)
  const tidyUpFlag = getOptionalStringFlag(flags, 'tidy-up')
  if (tidyUpFlag !== undefined && tidyUpFlag !== 'on' && tidyUpFlag !== 'off') {
    throw new RuntimeClientError('invalid_argument', '--tidy-up must be "on" or "off".')
  }
  const updates: Record<string, unknown> = {
    ...(name !== undefined ? { name } : {}),
    ...(agent !== undefined ? { agent } : {}),
    ...(model !== undefined ? { launch: { model } } : clearModel ? { launch: null } : {}),
    ...(permissionMode !== undefined ? { permissionMode } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
    ...(avatarColor !== undefined ? { avatarColor } : {}),
    ...(project !== undefined
      ? { project: project.trim() || null }
      : clearProject
        ? { project: null }
        : {}),
    ...(pause ? { paused: true } : resume ? { paused: false } : {}),
    ...(soul !== undefined ? { soul } : {}),
    ...(tidyUpFlag !== undefined ? { tidyUp: { on: tidyUpFlag === 'on' } } : {})
  }
  if (Object.keys(updates).length === 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Specify at least one update flag (--name, --agent, --model, --permission-mode, --project, --clear-project, --soul, --soul-file, --pause, --resume, --avatar, --tidy-up).'
    )
  }
  const result = await callBots<{ bot: Bot }>(client, 'bots.update', { botId: target.id, updates })
  printResult(result, json, ({ bot }) => {
    const modelNote = bot.launch?.model ? `, model: ${bot.launch.model}` : ''
    return `Updated bot ${formatBot(bot)}${modelNote}`
  })
}

async function handleBotDelete({ flags, client, json }: HandlerContext): Promise<void> {
  if (!flags.has('yes')) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Refusing to delete a bot without --yes. Pass --yes (and optionally --delete-folder).'
    )
  }
  const target = await findBot(client, requireBotSelector(flags))
  const deleteFolder = flags.has('delete-folder')
  const result = await callBots<{ deleted: boolean }>(client, 'bots.delete', {
    botId: target.id,
    ...(deleteFolder ? { deleteFolder: true } : {})
  })
  printResult(result, json, () =>
    deleteFolder
      ? `Deleted bot ${target.name} (${target.id}) and removed its folder.`
      : `Deleted bot ${target.name} (${target.id}). Its home folder was kept.`
  )
}

async function handleBotAgents({ client, json }: HandlerContext): Promise<void> {
  const result = await callBots<{ agents: BotAgent[] }>(client, 'bots.agentChoices')
  printResult(result, json, ({ agents }) =>
    agents.length === 0 ? 'No chat agents available on this host.' : agents.join('\n')
  )
}

async function handleBotSend({ flags, client, cwd, json }: HandlerContext): Promise<void> {
  const target = await findBot(client, requireBotSelector(flags))
  const message = await readMessageFlags(flags, cwd)
  const sessionId = getOptionalStringFlag(flags, 'chat')
  const result = await callBots<{ botId: string; sessionId: string; outcome: unknown }>(
    client,
    'bots.send',
    {
      botId: target.id,
      message,
      ...(sessionId ? { sessionId } : {})
    }
  )
  printResult(result, json, (value) => `Sent to ${target.name} (chat ${value.sessionId}).`)
}

export const BOT_MANAGE_HANDLERS: Record<string, CommandHandler> = {
  'bot show': handleBotShow,
  'bot update': handleBotUpdate,
  'bot delete': handleBotDelete,
  'bot agents': handleBotAgents,
  'bot send': handleBotSend
}
