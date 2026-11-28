import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { AeroKanbanPanelSnapshot } from '../../../../../shared/aero/aero-kanban-panel'
import { normalizeRuntimePathForComparison } from '../../../../../shared/file-access/cross-platform-path'
import { useSourceControlWatchConsumer } from '../../editor/external-changes/watching/source-control-watch-consumers'

type BoardLoad = { path: string; snapshot?: AeroKanbanPanelSnapshot; error?: string }

export function useAeroBoard(path: string | null) {
  const key = useId()
  const epoch = useRef(0)
  const [load, setLoad] = useState<BoardLoad | null>(null)
  const [loading, setLoading] = useState(false)
  const current = load?.path === path ? load : null
  const root = current?.snapshot?.root ?? path

  const refresh = useCallback(async () => {
    const request = ++epoch.current
    if (!path) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const snapshot = await window.api.aeroKanban.list({ path })
      if (request === epoch.current) {
        setLoad({ path, snapshot })
      }
    } catch (error) {
      if (request === epoch.current) {
        setLoad({ path, error: error instanceof Error ? error.message : String(error) })
      }
    }
    if (request === epoch.current) {
      setLoading(false)
    }
  }, [path])

  useSourceControlWatchConsumer(
    `aero-board:${key}`,
    root
      ? {
          worktreeId: `aero-board:${key}`,
          worktreePath: root,
          connectionId: undefined,
          runtimeEnvironmentId: null
        }
      : null,
    refresh
  )

  useEffect(() => {
    void refresh()
    return () => {
      epoch.current += 1
    }
  }, [refresh])

  useEffect(() => {
    if (!root) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = window.api.fs.onFsChanged((event) => {
      if (
        event.connectionId ||
        normalizeRuntimePathForComparison(event.worktreePath) !==
          normalizeRuntimePathForComparison(root)
      ) {
        return
      }
      if (
        !event.resync &&
        !event.events.some(
          (change) =>
            change.kind === 'overflow' ||
            [change.absolutePath, change.oldAbsolutePath].some((value) =>
              value?.replaceAll('\\', '/').includes('/.aerofortress')
            )
        )
      ) {
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        void refresh()
      }, 100)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [root, refresh])

  return { snapshot: current?.snapshot, error: current?.error, loading, refresh }
}
