import type { TabGroupLayoutNode } from '../../../../shared/workspace-layout/tab-groups/tab-types'
import { TabGroupSplitNodeTree } from './TabGroupSplitNodeTree'
import { WorkspaceTabDragLayer } from './WorkspaceTabDragLayer'
import { BotHomeChat } from '../bots/BotHomeChat'

/** Compose main-window chrome around the shared drag scope/tree; other hosts supply their own chrome. */
export default function TabGroupSplitLayout({
  layout,
  worktreeId,
  focusedGroupId,
  isWorktreeActive
}: {
  layout: TabGroupLayoutNode
  worktreeId: string
  focusedGroupId?: string
  isWorktreeActive: boolean
}): React.JSX.Element {
  return (
    <WorkspaceTabDragLayer worktreeId={worktreeId} enabled={isWorktreeActive}>
      {({ isTabDragActive, hoveredTabInsertion, setDragRootNode }) => (
        /* The 36px tab strip aligns directly with the 36px app header; the wrapper owns the single sidebar seam. */
        <div
          ref={setDragRootNode}
          className="workspace-sidebar-seam flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden border-l border-border"
        >
          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
            <TabGroupSplitNodeTree
              layout={layout}
              worktreeId={worktreeId}
              focusedGroupId={focusedGroupId}
              isWorktreeActive={isWorktreeActive}
              isTabDragActive={isTabDragActive}
              hoveredTabInsertion={hoveredTabInsertion}
              rootTouchesBottomEdge={true}
            />
          </div>
          {isWorktreeActive ? <BotHomeChat workspaceId={worktreeId} /> : null}
        </div>
      )}
    </WorkspaceTabDragLayer>
  )
}
