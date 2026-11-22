import { describe, expect, it, vi, beforeEach } from 'vitest'
import { tabItemLabel } from '../tab-bar/model/tab-bar-item-label'
import { embeddedBotTabId, openBotInWorkspacePane } from './bot-split-drag'

const mocks = vi.hoisted(() => ({
  openBotChat: vi.fn(),
  createUnifiedTab: vi.fn(),
  dropUnifiedTab: vi.fn(),
  focusGroup: vi.fn(),
  activateTab: vi.fn(),
  setActiveTabType: vi.fn(),
  unifiedTabsByWorktree: {} as Record<string, unknown[]>
}))

vi.mock('@/lib/bot-catalog', () => ({
  openBotChat: mocks.openBotChat,
  openBotHomeTab: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: mocks.unifiedTabsByWorktree,
      createUnifiedTab: mocks.createUnifiedTab,
      dropUnifiedTab: mocks.dropUnifiedTab,
      focusGroup: mocks.focusGroup,
      activateTab: mocks.activateTab,
      setActiveTabType: mocks.setActiveTabType
    })
  }
}))

describe('openBotInWorkspacePane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unifiedTabsByWorktree = {}
    mocks.openBotChat.mockResolvedValue('sess-123')
  })

  const bot = {
    id: 'bot-viajantes',
    hostId: 'local' as const,
    name: 'Viajantes',
    agent: 'claude' as const,
    folderWorkspaceId: 'fw-viajantes'
  }

  it('opens a bot Home Chat as an embedded split tab in another workspace', async () => {
    const ok = await openBotInWorkspacePane({
      bot,
      worktreeId: 'repo-1::/tmp/wt',
      targetGroupId: 'group-1',
      splitDirection: 'right'
    })
    expect(ok).toBe(true)
    expect(mocks.createUnifiedTab).toHaveBeenCalledWith(
      'repo-1::/tmp/wt',
      'agent-session',
      expect.objectContaining({
        id: embeddedBotTabId('bot-viajantes', 'sess-123'),
        entityId: 'sess-123',
        executionHostId: 'local',
        agentSessionAgent: 'claude',
        label: 'Viajantes',
        customLabel: 'Viajantes',
        embeddedBotId: 'bot-viajantes',
        split: { sourceGroupId: 'group-1', splitDirection: 'right', activate: true }
      })
    )
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('agent-session', 'repo-1::/tmp/wt')
  })

  it('moves an already-open embedded bot tab when dropped into a split zone', async () => {
    mocks.unifiedTabsByWorktree['repo-1::/tmp/wt'] = [
      {
        id: embeddedBotTabId('bot-viajantes', 'sess-123'),
        entityId: 'sess-123',
        groupId: 'group-1',
        contentType: 'agent-session',
        embeddedBotId: 'bot-viajantes'
      }
    ]
    const ok = await openBotInWorkspacePane({
      bot,
      worktreeId: 'repo-1::/tmp/wt',
      targetGroupId: 'group-2',
      splitDirection: 'down'
    })
    expect(ok).toBe(true)
    expect(mocks.createUnifiedTab).not.toHaveBeenCalled()
    expect(mocks.dropUnifiedTab).toHaveBeenCalledWith(
      embeddedBotTabId('bot-viajantes', 'sess-123'),
      {
        groupId: 'group-2',
        splitDirection: 'down'
      }
    )
  })

  it('preserves the bot name in the tab bar instead of overwriting with Home Chat', () => {
    const tabId = embeddedBotTabId('bot-viajantes', 'sess-123')
    const label = tabItemLabel(
      {
        type: 'agent-session',
        id: tabId,
        unifiedTabId: tabId,
        isPinned: false,
        data: {
          id: tabId,
          entityId: 'sess-123',
          groupId: 'group-1',
          worktreeId: 'repo-1::/tmp/wt',
          contentType: 'agent-session',
          label: 'Viajantes',
          customLabel: 'Viajantes',
          color: null,
          sortOrder: 0,
          createdAt: 0,
          embeddedBotId: 'bot-viajantes'
        }
      },
      true,
      'Home Chat'
    )
    expect(label).toBe('Viajantes')
  })
})
