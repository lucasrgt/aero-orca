import React, { useCallback, useMemo, useRef, useState } from 'react'
import { callBotRpc } from '@/lib/bot-hosts'
import { useFloatingProjectGroupHeaderDrag } from '@/components/sidebar/worktree-list/drag/use-floating-project-group-header-drag'
import {
  ROOT_PROJECT_GROUP_HEADER_BUCKET,
  type ProjectGroupHeaderDragItem
} from '@/components/sidebar/worktree-list/drag/project-group-header-drop'
import { WorktreeSidebarDropIndicator } from '@/components/sidebar/worktree-list/drag/WorktreeSidebarDropIndicator'
import { SidebarSectionHeader } from '@/components/sidebar/SidebarSectionHeader'
import { selectActiveBotGroupRoomId } from '@/lib/bot-group-catalog'
import { useBotGroups } from '@/lib/bot-group-list'
import { useTranslate } from '@/i18n/use-translate'
import { updateBot, useBotHomeWorkspaces, useBots } from '@/lib/bot-catalog'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { cn } from '@/lib/class-names'
import { BOTS_GROUP_KEY } from '../../../../shared/sidebar-list/sections/group-keys'
import {
  folderWorkspaceKey,
  getActiveSidebarWorkspaceId
} from '../../../../shared/workspace/identity/workspace-scope'
import { botGroupMemberBots } from '../../../../shared/bots/bot-sidebar-entries'
import { getHostKeyedBotSidebarEntries } from './bot-sidebar-entry-keys'
import { readBotHostState } from '@/lib/bot-catalog-snapshot'
import { BotSidebarDragFrame, BotSidebarEntry, type BotSidebarEntryDrag } from './BotSidebarEntry'
import { BotGroupRow } from './BotGroupRow'
import { BotGroupMembersDialog } from './BotGroupMembersDialog'
import { useBotGroupDelete } from './use-bot-group-delete'
import { findBotGroupRoom, type BotGroup } from '../../../../shared/bots/bot-group'
import { NewBotDialog } from './NewBotDialog'
import { BotSidebarOptionsMenu } from './BotSidebarOptionsMenu'
import { useBotSidebarArrangement } from './use-bot-sidebar-arrangement'
import { ImportBotDialog } from './ImportBotDialog'
import { botErrorMessage } from './bot-presentation'
import { BotCollapsedPreview, useBotPreviewFacts } from './BotCollapsedPreview'
import { collapsedBotPreview } from '../../../../shared/bots/bot-collapsed-preview'
import { BotSidebarSearchButton, BotSidebarSearchHost } from './BotSidebarSearch'
import { useBotCollapseAll } from './use-bot-collapse-all'
import { useBotSidebarSearch } from './use-bot-sidebar-search'
import { BotsCollapseAllButton } from './BotsCollapseAllButton'
import { useBotsSidebarReveal } from './bots-sidebar-reveal'
import { BotsRevealProvider } from './bots-sidebar-reveal-context'
import { SidebarBotsEmptyState } from './SidebarBotsEmptyState'
import { SidebarBotsNewMenu } from './SidebarBotsNewMenu'
import { BotSidebarVirtualRows } from './BotSidebarVirtualRows'
import { BotFleetChildFrame } from './BotFleetRolePicker'
import { BotProjectHeaderRow } from './BotProjectPicker'
import {
  botProjectCollapseKey,
  buildBotSidebarRows
} from '../../../../shared/bots/bot-project-groups'

/** Lists bots from this computer and paired servers in the sidebar. */
export function SidebarBotsSection({
  onOpenBot,
  reorderable = false
}: {
  onOpenBot: () => void
  reorderable?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const bots = useBots()
  const savedCollapsed = useAppStore((s) => s.collapsedGroups.has(BOTS_GROUP_KEY))
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  const activeWorkspaceId = useAppStore((s) =>
    s.activeView === 'tasks' ||
    s.activeView === 'activity' ||
    selectActiveBotGroupRoomId(s) !== null
      ? null
      : getActiveSidebarWorkspaceId(s.activeWorkspaceKey, s.activeWorktreeId)
  )
  const groups = useBotGroups()
  const folderWorkspaces = useBotHomeWorkspaces(bots, groups)
  const activeRoomId = useAppStore(selectActiveBotGroupRoomId)
  const activeGroupId = activeRoomId ? findBotGroupRoom(groups, activeRoomId)?.group.id : null
  const deleteGroup = useBotGroupDelete()
  const [newBotOpen, setNewBotOpen] = useState(false)
  const [newBotProject, setNewBotProject] = useState<string | undefined>(undefined)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const openNewBot = (project?: string): void => {
    setNewMenuOpen(false)
    setNewBotProject(project)
    setNewBotOpen(true)
  }
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const botGroupBy = useAppStore((s) => s.botSidebarView.groupBy ?? 'project')
  const repos = useAppStore((s) => s.repos)
  const [importOpen, setImportOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<BotGroup | 'new' | null>(null)
  // Bots and groups share one list and one order; the folded header shows bots only.
  const savedEntries = useMemo(
    () => getHostKeyedBotSidebarEntries(bots, groups, folderWorkspaces),
    [bots, groups, folderWorkspaces]
  )
  const entries = useBotSidebarArrangement(savedEntries)
  const listRef = useRef<HTMLDivElement>(null)
  // Search shows the list in place and nothing drags while it is open. Its toggle lives only in the
  // unfolded header, so a search always starts unfolded.
  const search = useBotSidebarSearch({ listRef, savedEntries, onOpenBot })
  const searchOpen = search.open
  // Only the saved order can be dragged, as for workspaces (disabled while grouped by project).
  const { rows: virtualEntries, grouped: groupedByProject } = useMemo(
    () => buildBotSidebarRows(entries, botGroupBy, collapsedGroups),
    [entries, botGroupBy, collapsedGroups]
  )
  const draggable =
    useAppStore((s) => s.botSidebarView.sortBy === 'manual') && !searchOpen && !groupedByProject
  const rows = useMemo(
    () => entries.flatMap((entry) => (entry.kind === 'bot' ? [entry] : [])),
    [entries]
  )
  const hasEntries = savedEntries.length > 0
  // Folds even while empty, so the onboarding card can be put away. A fold landing mid-search
  // (another writer) still leaves the results showing until the search ends.
  const collapsed = savedCollapsed && !searchOpen
  // The + menu unmounts with the folded header's controls; a fold it didn't see must not reopen it on unfold.
  if (collapsed && newMenuOpen) {
    setNewMenuOpen(false)
  }
  const collapseAll = useBotCollapseAll(entries, savedEntries)
  const facts = useBotPreviewFacts(rows)
  const preview = collapsedBotPreview(facts)
  // Bots reorder through the project-group header drag: one root bucket, each bot's order saved on its host.
  const botIdsByBucket = useMemo(
    () => new Map([[ROOT_PROJECT_GROUP_HEADER_BUCKET, entries.map(({ id }) => id)]]),
    [entries]
  )
  const dragItemById = useMemo(
    () =>
      new Map<string, ProjectGroupHeaderDragItem>(
        // An entry never placed takes no order, so the first drop writes one for every entry.
        entries.map((entry) => [
          entry.id,
          {
            parentGroupId: null,
            tabOrder: (entry.kind === 'bot' ? entry.bot : entry.group).sidebarOrder ?? -1
          }
        ])
      ),
    [entries]
  )
  const commitOrder = useCallback(
    (id: string, sidebarOrder: number) => {
      const entry = entries.find((candidate) => candidate.id === id)
      // A disconnected server's rows keep their place; a first drop doesn't write to them.
      if (
        !entry ||
        readBotHostState((entry.kind === 'bot' ? entry.bot : entry.group).hostId) !== 'live'
      ) {
        return
      }
      const saved =
        entry.kind === 'group'
          ? callBotRpc(entry.group, 'bots.groups.reorder', {
              groupId: entry.group.id,
              sidebarOrder
            })
          : updateBot(entry.bot, { sidebarOrder })
      saved.catch((error: unknown) => toast.error(botErrorMessage(error)))
    },
    [entries]
  )
  const drag = useFloatingProjectGroupHeaderDrag({
    sidebarProjectGroupHeaderIdsByBucket: botIdsByBucket,
    projectGroupById: dragItemById,
    onCommitProjectGroupTabOrder: commitOrder,
    getScrollContainer: () => listRef.current
  })
  const listShown = !collapsed && entries.length > 0
  const reveal = useBotsSidebarReveal(listRef, listShown, savedEntries, search.endForReveal)

  const toggleBots = (): void => {
    if (!search.endForFold()) {
      toggleCollapsedGroup(BOTS_GROUP_KEY)
    }
  }
  const collapseLabel = collapsed
    ? t('bots.section.expand', 'Expand Bots')
    : t('bots.section.collapse', 'Collapse Bots')

  return (
    // The sidebar's SidebarBotsSplit owns this section's height cap.
    // While searching it fills the held split, so the search area can center an empty result.
    <div className={cn('flex min-h-0 flex-col', searchOpen && 'grow')}>
      {/* Each folded face is a button of its own above the shared fold button. */}
      <SidebarSectionHeader
        title={t('bots.section.title', 'Bots')}
        sectionId="bots"
        reorderable={reorderable}
        fold={{
          collapsed,
          label: t(
            'bots.section.summary',
            '{{action}}, {{total}} bots, {{attention}} need you, {{unread}} unread, {{working}} working',
            {
              action: collapseLabel,
              total: preview.total,
              attention: preview.attention,
              unread: preview.unread,
              working: preview.working
            }
          ),
          tooltip: collapseLabel,
          onToggle: toggleBots
        }}
        titleAccessory={
          !collapsed && collapseAll && !searchOpen ? (
            <BotsCollapseAllButton collapseAll={collapseAll} />
          ) : null
        }
        summary={
          collapsed ? (
            <BotCollapsedPreview facts={facts} onOpenBot={onOpenBot} onExpand={toggleBots} />
          ) : null
        }
        actions={
          collapsed ? null : (
            <>
              {hasEntries ? (
                <BotSidebarSearchButton
                  open={searchOpen}
                  buttonRef={search.buttonRef}
                  onToggle={search.toggleOpen}
                />
              ) : null}
              {hasEntries ? <BotSidebarOptionsMenu /> : null}
              <SidebarBotsNewMenu
                open={newMenuOpen}
                onOpenChange={setNewMenuOpen}
                canCreateGroup={bots.length >= 2}
                onNewBot={() => openNewBot()}
                onNewGroup={() => setEditingGroup('new')}
                onImport={() => setImportOpen(true)}
              />
            </>
          )
        }
      />
      <BotSidebarSearchHost
        open={searchOpen}
        regionRef={search.regionRef}
        panel={{
          entries,
          allEntries: savedEntries,
          bots,
          onSelect: search.select,
          onSupersede: search.supersede,
          onCancel: search.cancel
        }}
      >
        <BotsRevealProvider value={reveal}>
          <div
            ref={listRef}
            data-bot-sidebar-list=""
            className={cn(
              'bot-sidebar-scrollbar relative flex min-h-0 flex-col overflow-y-auto overscroll-y-contain [overflow-anchor:none]',
              entries.length > 0 && 'pb-1 pl-1',
              collapsed && 'hidden'
            )}
          >
            {/* A room kept after its last bot went still lists, so it can be opened or deleted. */}
            {savedEntries.length > 0 && entries.length === 0 ? (
              collapsed ? null : (
                <div className="px-4 text-xs text-muted-foreground">
                  {t('bots.options.allHidden', 'All bots are paused and hidden.')}
                </div>
              )
            ) : entries.length === 0 ? (
              collapsed ? null : (
                <SidebarBotsEmptyState onNewBot={() => openNewBot()} />
              )
            ) : collapsed ? null : (
              <>
                <BotSidebarVirtualRows
                  entries={virtualEntries}
                  listRef={listRef}
                  draggingId={drag.state.draggingGroupId}
                  revealId={reveal.request?.target.entryKey}
                  renderEntry={(row) => {
                    if (row.kind === 'project-header') {
                      const collapseKey = botProjectCollapseKey(row.projectKey)
                      return (
                        <BotProjectHeaderRow
                          projectKey={row.projectKey}
                          label={row.label}
                          count={row.count}
                          collapsed={row.collapsed}
                          isGeneral={row.isGeneral}
                          afterGlobalAdmiral={row.afterGlobalAdmiral}
                          repos={repos}
                          onToggle={() => toggleCollapsedGroup(collapseKey)}
                          onNewBot={(project) => openNewBot(project)}
                        />
                      )
                    }
                    const { entry, originalIndex, fleetChild } = row
                    const entryDrag: BotSidebarEntryDrag | undefined = draggable
                      ? {
                          index: originalIndex,
                          dragging: drag.state.draggingGroupId === entry.id,
                          settling: drag.state.draggingGroupId !== null,
                          offset: drag.state.previewOffsetsById?.get(entry.id) ?? 0,
                          onPointerDown: (event) => drag.onHandlePointerDown(event, entry.id)
                        }
                      : undefined
                    const entryNode =
                      entry.kind === 'group' ? (
                        <BotSidebarDragFrame id={entry.id} drag={entryDrag}>
                          <BotGroupRow
                            group={entry.group}
                            home={entry.home}
                            members={botGroupMemberBots(entry.group, bots)}
                            isActive={activeGroupId === entry.group.id}
                            onOpen={onOpenBot}
                            onManageMembers={() => setEditingGroup(entry.group)}
                            onDelete={() => void deleteGroup(entry.group)}
                            dragHandle={draggable}
                          />
                        </BotSidebarDragFrame>
                      ) : (
                        <BotSidebarEntry
                          bot={entry.bot}
                          home={entry.home}
                          isActive={activeWorkspaceId === folderWorkspaceKey(entry.home.id)}
                          onOpen={onOpenBot}
                          drag={entryDrag}
                        />
                      )
                    return fleetChild ? (
                      <BotFleetChildFrame position={fleetChild}>{entryNode}</BotFleetChildFrame>
                    ) : (
                      entryNode
                    )
                  }}
                />
                {drag.state.draggingGroupId !== null && drag.state.dropIndicatorY !== null ? (
                  <WorktreeSidebarDropIndicator y={drag.state.dropIndicatorY} />
                ) : null}
              </>
            )}
          </div>
        </BotsRevealProvider>
      </BotSidebarSearchHost>
      <NewBotDialog
        open={newBotOpen}
        onOpenChange={(open) => {
          setNewBotOpen(open)
          if (!open) {
            setNewBotProject(undefined)
          }
        }}
        initialProject={newBotProject}
        onCreated={onOpenBot}
        onImport={() => setImportOpen(true)}
      />
      <ImportBotDialog open={importOpen} onOpenChange={setImportOpen} onCreated={onOpenBot} />
      {editingGroup ? (
        <BotGroupMembersDialog
          group={editingGroup === 'new' ? undefined : editingGroup}
          onClose={() => setEditingGroup(null)}
        />
      ) : null}
    </div>
  )
}
