// `orca bot create`: create a bot directly on this host (or `--environment`), or with `--offer` propose one as a card.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readInjectedAgentSessionId } from '../../shared/agent-session/lifecycle/launch/agent-session-caller-env'
import {
  AGENT_CHAT_PERMISSION_MODES,
  type AgentChatPermissionMode
} from '../../shared/agent-launch/permissions/agent-chat-permission-mode'
import { BOT_AGENTS, isBotAgent, type Bot, type BotAgent } from '../../shared/bot-types'
import { BOT_ROLES, isBotRole, type BotRole } from '../../shared/bots/bot-fleet-role'
import { BOT_TEMPLATES, botTemplate } from '../../shared/bots/bot-templates'
import type { HandedWorkspace } from '../../shared/bots/bot-made-for-workspaces'
import type {
  RuntimeWorktreePsSummary,
  RuntimeWorktreeRecord
} from '../../shared/worktree/catalog/runtime-worktree-contracts'
import type { CommandHandler } from '../dispatch/dispatch'
import {
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag
} from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/connection/types'
import type { RuntimeClient } from '../runtime/client'
import { callBots, formatBot } from './bot'
import { WORKTREE_PS_SINCE_READ_LIMIT } from '../workspaces/worktree-ps-recent'
import { readWorktreePsAcrossServers } from '../workspaces/worktree-ps-fleet'

/** The listed row a selector names, when exactly one does. */
function rowFor(
  rows: RuntimeWorktreePsSummary[],
  selector: string
): RuntimeWorktreePsSummary | undefined {
  const value = selector.replace(/^(id|name):/, '')
  const matches = rows.filter((row) =>
    selector.startsWith('id:')
      ? row.worktreeId === value
      : selector.startsWith('name:')
        ? row.displayName === value
        : row.worktreeId === value || row.displayName === value
  )
  return matches.length === 1 ? matches[0] : undefined
}

async function worktreesOf(client: RuntimeClient, selectors: string[]): Promise<HandedWorkspace[]> {
  if (selectors.length === 0) {
    return []
  }
  // Listed rows cover paired servers too; anything else is resolved here.
  const rows = (await readWorktreePsAcrossServers(client, { limit: WORKTREE_PS_SINCE_READ_LIMIT }))
    .result.worktrees
  const found: HandedWorkspace[] = []
  for (const selector of selectors) {
    const row = rowFor(rows, selector)
    const record = row
      ? { id: row.worktreeId, displayName: row.displayName }
      : (
          await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
            worktree: selector
          })
        ).result.worktree
    if (!found.some((entry) => entry.id === String(record.id))) {
      found.push({ id: String(record.id), name: String(record.displayName || selector) })
    }
  }
  return found
}

export function parseBotAgentFlag(value: string | undefined): BotAgent | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!isBotAgent(value)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--agent must be one of: ${BOT_AGENTS.join(', ')}`
    )
  }
  return value
}

export function parseBotRoleFlag(value: string | undefined): BotRole | undefined {
  if (value === undefined) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (!isBotRole(normalized)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--role must be one of: ${BOT_ROLES.join(', ')}`
    )
  }
  return normalized
}

export function parseBotPermissionModeFlag(
  value: string | undefined
): AgentChatPermissionMode | undefined {
  if (value === undefined) {
    return undefined
  }
  const match = AGENT_CHAT_PERMISSION_MODES.find((mode) => mode === value)
  if (!match) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--permission-mode must be one of: ${AGENT_CHAT_PERMISSION_MODES.join(', ')}`
    )
  }
  return match
}

export async function readSoulFlags(
  flags: Map<string, string | boolean>,
  cwd: string
): Promise<string | undefined> {
  const inline = getOptionalStringFlag(flags, 'soul')
  const filePath = getOptionalStringFlag(flags, 'soul-file')
  if (inline !== undefined && filePath !== undefined) {
    throw new RuntimeClientError('invalid_argument', 'Pass either --soul or --soul-file, not both.')
  }
  if (filePath !== undefined) {
    return await readFile(resolve(cwd, filePath), 'utf8')
  }
  return inline
}

function resolveTemplate(flags: Map<string, string | boolean>) {
  const templateId = getOptionalStringFlag(flags, 'template')
  const template = templateId === undefined ? null : botTemplate(templateId)
  if (templateId !== undefined && !template) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--template is one of: ${BOT_TEMPLATES.map((entry) => entry.id).join(', ')}`
    )
  }
  return template
}

async function offer({ flags, client, json }: Parameters<CommandHandler>[0]): Promise<void> {
  const callerSessionId = readInjectedAgentSessionId()
  if (!callerSessionId) {
    throw new RuntimeClientError('invalid_argument', "Run this from a bot's chat.")
  }
  const template = resolveTemplate(flags)
  const purpose = getOptionalStringFlag(flags, 'purpose') ?? template?.line
  if (!purpose) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--offer needs --purpose: what the bot is for, in one sentence.'
    )
  }
  const field = (name: 'watches' | 'does' | 'reports') =>
    getOptionalStringFlag(flags, name) ?? template?.[name]
  const worktrees = await worktreesOf(client, getRepeatedStringFlag(flags, 'worktree'))
  const watches = field('watches')
  const does = field('does')
  const reports = field('reports')
  const result = await callBots<{ offered: boolean; message: string }>(client, 'bots.createOffer', {
    callerSessionId,
    name:
      getOptionalStringFlag(flags, 'name') ??
      template?.name ??
      getRequiredStringFlag(flags, 'name'),
    purpose,
    ...(watches ? { watches } : {}),
    ...(does ? { does } : {}),
    ...(reports ? { reports } : {}),
    ...(template ? { templateId: template.id } : {}),
    ...(worktrees.length ? { worktrees } : {})
  })
  printResult(result, json, (value) => value.message)
}

async function createDirect({
  flags,
  client,
  cwd,
  json
}: Parameters<CommandHandler>[0]): Promise<void> {
  const template = resolveTemplate(flags)
  const name = getOptionalStringFlag(flags, 'name') ?? template?.name ?? ''
  const agent = parseBotAgentFlag(getOptionalStringFlag(flags, 'agent'))
  const model = getOptionalStringFlag(flags, 'model')
  const effort = getOptionalStringFlag(flags, 'effort')
  const permissionMode = parseBotPermissionModeFlag(getOptionalStringFlag(flags, 'permission-mode'))
  const avatar = getOptionalStringFlag(flags, 'avatar')
  const avatarColor = getOptionalStringFlag(flags, 'avatar-color')
  const project = getOptionalStringFlag(flags, 'project')
  const role = parseBotRoleFlag(getOptionalStringFlag(flags, 'role'))
  const territory = getOptionalStringFlag(flags, 'territory')
  const soul = await readSoulFlags(flags, cwd)
  const purpose = getOptionalStringFlag(flags, 'purpose') ?? template?.line
  const watches = getOptionalStringFlag(flags, 'watches') ?? template?.watches
  const does = getOptionalStringFlag(flags, 'does') ?? template?.does
  const reports = getOptionalStringFlag(flags, 'reports') ?? template?.reports
  const worktrees = await worktreesOf(client, getRepeatedStringFlag(flags, 'worktree'))
  const seed =
    purpose !== undefined
      ? {
          purpose,
          ...(watches ? { watches } : {}),
          ...(does ? { does } : {}),
          ...(reports ? { reports } : {}),
          ...(template ? { templateId: template.id } : {})
        }
      : undefined
  const launch =
    model || effort
      ? {
          ...(model ? { model } : {}),
          ...(effort ? { options: { effort } } : {})
        }
      : undefined
  const params: Record<string, unknown> = {
    name,
    ...(agent ? { agent } : {}),
    ...(launch ? { launch } : {}),
    ...(permissionMode ? { permissionMode } : {}),
    ...(avatar ? { avatar } : {}),
    ...(avatarColor ? { avatarColor } : {}),
    ...(project ? { project } : {}),
    ...(role ? { role } : {}),
    ...(territory ? { territory } : {}),
    ...(seed ? { seed } : {}),
    ...(soul !== undefined ? { soul } : {}),
    ...(worktrees.length ? { handOff: worktrees } : {}),
    ...(template ? { fromTemplate: { id: template.id, skills: [] } } : {}),
    ...(flags.has('no-kickoff') ? { skipKickoff: true } : {})
  }
  const result = await callBots<{ bot: Bot }>(client, 'bots.create', params)
  printResult(result, json, ({ bot }) => {
    const modelNote = bot.launch?.model ? `, model: ${bot.launch.model}` : ''
    return `Created bot ${formatBot(bot)}${modelNote}`
  })
}

export const BOT_CREATE_HANDLERS: Record<string, CommandHandler> = {
  'bot create': async (context) => {
    if (context.flags.has('offer')) {
      await offer(context)
      return
    }
    await createDirect(context)
  }
}
