import { toast } from 'sonner'
import type { Bot } from '../../../../shared/bot-types'
import {
  folderWorkspaceKey,
  getActiveSidebarWorkspaceId
} from '../../../../shared/workspace/identity/workspace-scope'
import { openBotChat, openBotHomeTab } from '@/lib/bot-catalog'
import { useAppStore } from '@/store'
import type { TabSplitDirection } from '@/store/slices/tabs/tabs-slice-contract'
import { botErrorMessage } from './bot-presentation'

export const BOT_SPLIT_DRAG_MIME = 'application/x-orca-bot-split'
export const BOT_SPLIT_DRAG_START_EVENT = 'orca:bot-split-drag-start'
export const BOT_SPLIT_DRAG_END_EVENT = 'orca:bot-split-drag-end'

export type BotSplitDragPayload = {
  botId: string
  hostId: Bot['hostId']
  name: string
  agent: Bot['agent']
  folderWorkspaceId: string
}

let activeBotSplitDrag: BotSplitDragPayload | null = null

export function botSplitDragPayload(bot: Bot): BotSplitDragPayload {
  return {
    botId: bot.id,
    hostId: bot.hostId,
    name: bot.name,
    agent: bot.agent,
    folderWorkspaceId: bot.folderWorkspaceId
  }
}

export function writeBotSplitDragData(
  dataTransfer: DataTransfer,
  payload: BotSplitDragPayload
): void {
  activeBotSplitDrag = payload
  dataTransfer.effectAllowed = 'copyMove'
  dataTransfer.setData(BOT_SPLIT_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.name)
  window.dispatchEvent(new CustomEvent(BOT_SPLIT_DRAG_START_EVENT))
}

export function hasBotSplitDragData(dataTransfer: DataTransfer | null | undefined): boolean {
  if (activeBotSplitDrag !== null) {
    return true
  }
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes(BOT_SPLIT_DRAG_MIME))
}

export function readBotSplitDragData(
  dataTransfer: DataTransfer | null | undefined
): BotSplitDragPayload | null {
  if (activeBotSplitDrag) {
    return activeBotSplitDrag
  }
  const raw = dataTransfer?.getData(BOT_SPLIT_DRAG_MIME)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BotSplitDragPayload>
    if (parsed.botId && parsed.hostId && parsed.name && parsed.agent && parsed.folderWorkspaceId) {
      return parsed as BotSplitDragPayload
    }
  } catch {
    // Ignore malformed drag data from external sources.
  }
  return null
}

export function clearBotSplitDragData(): void {
  activeBotSplitDrag = null
  window.dispatchEvent(new CustomEvent(BOT_SPLIT_DRAG_END_EVENT))
}

export function embeddedBotTabId(botId: string, sessionId: string): string {
  return `bot-split:${botId}:${sessionId}`
}

/**
 * Opens a bot's live Home Chat inside any workspace tab group or split pane without
 * navigating away from the current workspace.
 */
export async function openBotInWorkspacePane(args: {
  bot: Pick<Bot, 'id' | 'hostId' | 'name' | 'agent' | 'folderWorkspaceId'>
  worktreeId: string
  targetGroupId: string
  splitDirection?: TabSplitDirection
}): Promise<boolean> {
  const { bot, worktreeId, targetGroupId, splitDirection } = args
  let chatSessionId: string
  try {
    chatSessionId = await openBotChat({ id: bot.id, hostId: bot.hostId })
  } catch (error: unknown) {
    toast.error(botErrorMessage(error))
    return false
  }
  const state = useAppStore.getState()
  const existingTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const existing = existingTabs.find(
    (tab) => tab.contentType === 'agent-session' && tab.entityId === chatSessionId
  )
  if (existing) {
    if (splitDirection) {
      state.dropUnifiedTab(existing.id, { groupId: targetGroupId, splitDirection })
    } else {
      state.focusGroup(worktreeId, existing.groupId)
      state.activateTab(existing.id, { worktreeId })
    }
    state.setActiveTabType('agent-session', worktreeId)
    return true
  }

  const isOwnHomeWorkspace = worktreeId === folderWorkspaceKey(bot.folderWorkspaceId)
  const tabId = isOwnHomeWorkspace
    ? `agent-session:${chatSessionId}`
    : embeddedBotTabId(bot.id, chatSessionId)
  state.createUnifiedTab(worktreeId, 'agent-session', {
    id: tabId,
    entityId: chatSessionId,
    executionHostId: bot.hostId,
    agentSessionAgent: bot.agent,
    label: bot.name,
    customLabel: isOwnHomeWorkspace ? null : bot.name,
    ...(isOwnHomeWorkspace ? {} : { embeddedBotId: bot.id }),
    ...(splitDirection
      ? { split: { sourceGroupId: targetGroupId, splitDirection, activate: true } }
      : { targetGroupId, activate: true })
  })
  state.setActiveTabType('agent-session', worktreeId)
  return true
}

/** Opens a bot in a split beside the currently active workspace pane (or opens its Home tab if none). */
export async function openBotInActiveWorkspaceSplit(
  bot: Bot,
  splitDirection: TabSplitDirection = 'right'
): Promise<boolean> {
  const state = useAppStore.getState()
  const worktreeId = getActiveSidebarWorkspaceId(state.activeWorkspaceKey, state.activeWorktreeId)
  if (!worktreeId || state.activeView !== 'terminal') {
    return openBotHomeTab(bot)
  }
  const targetGroupId =
    state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id
  if (!targetGroupId) {
    return openBotHomeTab(bot)
  }
  return openBotInWorkspacePane({ bot, worktreeId, targetGroupId, splitDirection })
}
