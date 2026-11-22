import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { resolveDropZone } from './tab-drop-zone'
import type { TabDropZone } from './tab-drag-data'
import {
  BOT_SPLIT_DRAG_END_EVENT,
  BOT_SPLIT_DRAG_START_EVENT,
  clearBotSplitDragData,
  hasBotSplitDragData,
  openBotInWorkspacePane,
  readBotSplitDragData
} from '../../bots/bot-split-drag'

type PaneDropTarget = {
  groupId: string
  zone: TabDropZone
  overlayStyle: CSSProperties
}

function getZoneOverlayStyle(rect: DOMRect, layerRect: DOMRect, zone: TabDropZone): CSSProperties {
  const left = rect.left - layerRect.left
  const top = rect.top - layerRect.top
  const width = rect.width
  const height = rect.height
  switch (zone) {
    case 'up':
      return { left, top, width, height: height / 2 }
    case 'down':
      return { left, top: top + height / 2, width, height: height / 2 }
    case 'left':
      return { left, top, width: width / 2, height }
    case 'right':
      return { left: left + width / 2, top, width: width / 2, height }
    case 'center':
      return { left, top, width, height }
  }
}

function containsPoint(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function resolvePaneDropTarget(
  worktreeId: string,
  layerRect: DOMRect,
  point: { x: number; y: number }
): PaneDropTarget | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tab-group-body-id][data-worktree-id]')
  )
  for (const element of elements) {
    if (element.dataset.worktreeId !== worktreeId) {
      continue
    }
    const groupId = element.dataset.tabGroupBodyId
    const rect = element.getBoundingClientRect()
    if (!groupId || rect.width <= 0 || rect.height <= 0 || !containsPoint(rect, point.x, point.y)) {
      continue
    }
    const zone = resolveDropZone(rect, point)
    return { groupId, zone, overlayStyle: getZoneOverlayStyle(rect, layerRect, zone) }
  }
  return null
}

/** Accepts dragged sidebar bots over any workspace pane and opens their live Home Chat in a split or tab. */
export default function BotSplitDropLayer({
  worktreeId,
  enabled
}: {
  worktreeId: string
  enabled: boolean
}): React.JSX.Element {
  const [isDragActive, setIsDragActive] = useState(false)
  const [target, setTarget] = useState<PaneDropTarget | null>(null)
  const [botLabel, setBotLabel] = useState<string | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  const clearDragState = useCallback(() => {
    setIsDragActive(false)
    setTarget(null)
    setBotLabel(null)
  }, [])

  const updateTarget = useCallback(
    (dataTransfer: DataTransfer, point: { x: number; y: number }): PaneDropTarget | null => {
      if (!hasBotSplitDragData(dataTransfer)) {
        setTarget(null)
        return null
      }
      const layerElement = layerRef.current
      if (!layerElement) {
        setTarget(null)
        return null
      }
      const payload = readBotSplitDragData(dataTransfer)
      if (payload) {
        setBotLabel(payload.name)
      }
      const nextTarget = resolvePaneDropTarget(
        worktreeId,
        layerElement.getBoundingClientRect(),
        point
      )
      setTarget((current) =>
        current?.groupId === nextTarget?.groupId &&
        current?.zone === nextTarget?.zone &&
        current?.overlayStyle.left === nextTarget?.overlayStyle.left &&
        current?.overlayStyle.top === nextTarget?.overlayStyle.top &&
        current?.overlayStyle.width === nextTarget?.overlayStyle.width &&
        current?.overlayStyle.height === nextTarget?.overlayStyle.height
          ? current
          : nextTarget
      )
      return nextTarget
    },
    [worktreeId]
  )

  const handleBotDrop = useCallback(
    (dataTransfer: DataTransfer, point: { x: number; y: number }): boolean => {
      if (!hasBotSplitDragData(dataTransfer)) {
        return false
      }
      const dropTarget = updateTarget(dataTransfer, point) ?? target
      const payload = readBotSplitDragData(dataTransfer)
      clearBotSplitDragData()
      clearDragState()
      if (!dropTarget || !payload) {
        return false
      }
      void openBotInWorkspacePane({
        bot: {
          id: payload.botId,
          hostId: payload.hostId,
          name: payload.name,
          agent: payload.agent,
          folderWorkspaceId: payload.folderWorkspaceId
        },
        worktreeId,
        targetGroupId: dropTarget.groupId,
        splitDirection: dropTarget.zone === 'center' ? undefined : dropTarget.zone
      })
      return true
    },
    [clearDragState, target, updateTarget, worktreeId]
  )

  useEffect(() => {
    if (!enabled) {
      clearDragState()
      return
    }
    const markActive = (): void => {
      const payload = readBotSplitDragData(null)
      setBotLabel(payload?.name ?? null)
      setIsDragActive(true)
    }
    const markIfBotDrag = (event: DragEvent): void => {
      if (hasBotSplitDragData(event.dataTransfer)) {
        markActive()
      }
    }
    const handleWindowDrop = (event: DragEvent): void => {
      if (!event.dataTransfer || !hasBotSplitDragData(event.dataTransfer)) {
        return
      }
      if (handleBotDrop(event.dataTransfer, { x: event.clientX, y: event.clientY })) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('dragenter', markIfBotDrag, true)
    window.addEventListener('dragover', markIfBotDrag, true)
    window.addEventListener('drop', handleWindowDrop, true)
    window.addEventListener('dragend', clearDragState, true)
    window.addEventListener(BOT_SPLIT_DRAG_START_EVENT, markActive)
    window.addEventListener(BOT_SPLIT_DRAG_END_EVENT, clearDragState)
    return () => {
      window.removeEventListener('dragenter', markIfBotDrag, true)
      window.removeEventListener('dragover', markIfBotDrag, true)
      window.removeEventListener('drop', handleWindowDrop, true)
      window.removeEventListener('dragend', clearDragState, true)
      window.removeEventListener(BOT_SPLIT_DRAG_START_EVENT, markActive)
      window.removeEventListener(BOT_SPLIT_DRAG_END_EVENT, clearDragState)
    }
  }, [clearDragState, enabled, handleBotDrop])

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      data-bot-split-drop-layer="true"
      data-worktree-id={worktreeId}
      className={`absolute inset-0 z-[10000] ${
        isDragActive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      onDragOver={(event) => {
        if (!hasBotSplitDragData(event.dataTransfer)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        setIsDragActive(true)
        const nextTarget = updateTarget(event.dataTransfer, {
          x: event.clientX,
          y: event.clientY
        })
        event.dataTransfer.dropEffect = nextTarget ? 'copy' : 'none'
      }}
      onDrop={(event) => {
        if (!hasBotSplitDragData(event.dataTransfer)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        handleBotDrop(event.dataTransfer, { x: event.clientX, y: event.clientY })
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return
        }
        setTarget(null)
      }}
    >
      {isDragActive && target ? (
        <div
          className="tab-drop-overlay absolute flex items-center justify-center"
          style={target.overlayStyle}
        >
          {botLabel ? (
            <span className="rounded-md border border-border/70 bg-popover/90 px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-sm backdrop-blur-xs">
              {botLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
