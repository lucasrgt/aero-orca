import { useState } from 'react'
import { useAppStore } from '@/store'
import { repoMatchesHostIdentity } from '@/store/repos/repo-host-identity'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { AeroBoardCards } from './AeroBoardCards'
import { useAeroBoard } from './use-aero-board'
import { AeroBoardEditor } from './AeroBoardEditor'

export default function AeroBoardPanel(): React.JSX.Element {
  const t = useTranslate()
  const activeWorktree = useActiveWorktree()
  const repo = useAppStore((state) =>
    activeWorktree
      ? (state.repos.find((candidate) =>
          repoMatchesHostIdentity(
            candidate,
            activeWorktree.repoId,
            activeWorktree.hostId ?? 'local'
          )
        ) ?? null)
      : null
  )
  const local = repo ? getRepoExecutionHostId(repo) === 'local' : false
  const { snapshot, loading, error, refresh } = useAeroBoard(local ? (repo?.path ?? null) : null)
  const [selection, setSelection] = useState<{ root: string; stem: string } | null>(null)
  const selected =
    snapshot?.boards.find(
      (board) =>
        selection !== null && selection.root === snapshot.root && board.stem === selection.stem
    ) ?? snapshot?.boards[0]

  if (!repo || !local) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {!repo
          ? t('aero.kanban.chooseProject', 'Select a project to see its boards.')
          : t('aero.kanban.localOnly', 'Aero boards are currently available for local projects.')}
      </p>
    )
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
      data-aero-board-panel=""
    >
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t('aero.kanban.title', 'Aero boards')}</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void refresh()
            }}
          >
            {t('aero.kanban.refresh', 'Refresh')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'aero.kanban.liveEditing',
            'Changes are saved to your Aero boards and refresh automatically.'
          )}
        </p>
        {snapshot && (
          <AeroBoardEditor
            key={`${snapshot.root}:${selected?.stem ?? ''}`}
            path={snapshot.root}
            board={selected}
            onChanged={refresh}
          />
        )}
        {selected && snapshot && (
          <Select
            value={selected.stem}
            onValueChange={(stem) => setSelection({ root: snapshot.root, stem })}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t('aero.kanban.selectBoard', 'Select board')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {snapshot.boards.map((board) => (
                <SelectItem key={board.stem} value={board.stem}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {error && (
        <p role="alert" className="break-words p-3 text-sm text-destructive">
          {t('aero.kanban.loadError', 'Could not load boards: {{error}}', { error })}
        </p>
      )}
      {snapshot && snapshot.skipped.length > 0 && (
        <p role="status" className="break-words p-3 text-xs text-muted-foreground">
          {t('aero.kanban.skipped', 'Unreadable boards: {{boards}}', {
            boards: snapshot.skipped.join(', ')
          })}
        </p>
      )}
      {loading && !snapshot && (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {t('aero.kanban.loading', 'Loading boards…')}
        </p>
      )}
      {!loading && !error && snapshot?.boards.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          {t('aero.kanban.empty', 'No Aero boards in this project yet.')}
        </p>
      )}
      {selected && snapshot && (
        <AeroBoardCards
          key={`${snapshot.root}:${selected.stem}`}
          board={selected}
          path={snapshot.root}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
