// A bot's page is its home folder workspace; these find the bot behind a workspace or a tab.
import { readBots, readBotsEnabled, useBots, useBotsEnabled } from '@/lib/bot-catalog'
import { useBotGroups } from '@/lib/bot-group-list'
import { useAppStore } from '@/store'
import type { Bot } from '../../../../shared/bot-types'
import type { BotGroup } from '../../../../shared/bots/bot-group'
import type { Tab } from '../../../../shared/workspace-layout/tab-groups/tab-types'
import {
  folderWorkspaceKey,
  parseWorkspaceKey
} from '../../../../shared/workspace/identity/workspace-scope'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { botOfHomeWorkspace } from '../../../../shared/bots/bot-homes'
import { isBotHomeTab } from '../../../../shared/bots/bot-home-tab'

/** With `hostId`, only a bot on that host, so the same workspace id on two hosts never names the other's bot. */
export function findBotByWorkspace(
  bots: readonly Bot[],
  workspaceId: string | null,
  hostId?: ExecutionHostId
): Bot | null {
  if (!hostId) {
    return botOfHomeWorkspace(bots, workspaceId)
  }
  return (
    bots.find(
      (bot) => bot.hostId === hostId && folderWorkspaceKey(bot.folderWorkspaceId) === workspaceId
    ) ?? null
  )
}

/** With bots off a home is a plain folder. */
export function isBotPage(workspaceId: string): boolean {
  return readBotsEnabled() && findBotByWorkspace(readBots(), workspaceId) !== null
}

/** Only folder workspaces can be a bot's home, so other workspaces never read the bots; with bots off a home is a plain folder. */
export function useBotForWorkspace(
  workspaceId: string | null,
  hostId?: ExecutionHostId
): Bot | null {
  const botsEnabled = useBotsEnabled()
  const bots = useBots(botsEnabled && parseWorkspaceKey(workspaceId ?? '')?.type === 'folder')
  return findBotByWorkspace(bots, workspaceId, hostId)
}

/** Finds a bot by id (and optional hostId), used for embedded/split bot tabs opened in another workspace. */
export function useBotById(botId: string | null | undefined, hostId?: ExecutionHostId): Bot | null {
  const botsEnabled = useBotsEnabled()
  const bots = useBots(botsEnabled && Boolean(botId))
  if (!botId) {
    return null
  }
  return (
    bots.find((bot) => bot.id === botId && (hostId === undefined || bot.hostId === hostId)) ?? null
  )
}

/** If `tabId` is an embedded/split bot tab opened inside another workspace, returns that bot. */
export function useEmbeddedBotForTab(tabId: string): Bot | null {
  const ref = useAppStore((state) => {
    for (const tabs of Object.values(state.unifiedTabsByWorktree)) {
      const match = tabs.find((entry) => entry.id === tabId)
      if (match?.embeddedBotId) {
        return `${match.embeddedBotId}\0${match.executionHostId ?? ''}`
      }
    }
    return null
  })
  const [botId, rawHostId] = ref ? ref.split('\0') : [null, '']
  return useBotById(botId, (rawHostId || undefined) as ExecutionHostId | undefined)
}

/** The group whose room lives in this folder workspace; like a bot's home, only with bots on. */
export function useBotGroupForWorkspace(workspaceId: string | null): BotGroup | null {
  const botsEnabled = useBotsEnabled()
  const groups = useBotGroups(
    botsEnabled && parseWorkspaceKey(workspaceId ?? '')?.type === 'folder'
  )
  return botOfHomeWorkspace(groups, workspaceId)
}

/** The bot's Chat, shown as its Home tab, which stays open for the life of the bot. */
export function isBotChatSession(bots: readonly Bot[], sessionId: string): boolean {
  return bots.some((bot) => bot.chatSessionId === sessionId)
}

/** Whether `tab` is the Home of the bot whose page holds it; with bots off there is no Home. */
export function isBotChatTab(tab: Pick<Tab, 'contentType' | 'entityId' | 'worktreeId'>): boolean {
  return readBotsEnabled() && isBotHomeTab(tab, findBotByWorkspace(readBots(), tab.worktreeId))
}
