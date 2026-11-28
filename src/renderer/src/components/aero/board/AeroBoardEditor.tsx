import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslate } from '@/i18n/use-translate'
import type {
  AeroKanbanPanelBoard,
  AeroKanbanPanelCard,
  AeroKanbanPanelApi
} from '../../../../../shared/aero/aero-kanban-panel'

type Edit = { kind: 'board' | 'card'; card?: AeroKanbanPanelCard }
type Mutation = Parameters<AeroKanbanPanelApi['mutate']>[0]

export function AeroBoardEditor({
  path,
  board,
  card,
  onChanged
}: {
  path: string
  board?: AeroKanbanPanelBoard
  card?: AeroKanbanPanelCard
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const t = useTranslate()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const [edit, setEdit] = useState<Edit | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tasks, setTasks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function open(value: Edit) {
    setTitle(value.card?.title ?? '')
    setDesc(value.card?.desc ?? '')
    setTasks(
      value.card?.subtasks.map((task) => `${task.done ? '[x]' : '[ ]'} ${task.title}`).join('\n') ??
        ''
    )
    setError(null)
    setEdit(value)
  }
  async function run(tool: Mutation['tool'], args: Mutation['args']) {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.aeroKanban.mutate({ path, tool, args })
      if (alive.current) {
        setEdit(null)
        await onChanged()
      }
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    if (alive.current) {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!card && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => open({ kind: 'board' })}
          >
            {t('aero.kanban.newBoard', 'New board')}
          </Button>
        )}
        {board && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => open({ kind: 'card', card })}
          >
            {card ? t('aero.kanban.editCard', 'Edit card') : t('aero.kanban.newCard', 'New card')}
          </Button>
        )}
        {board &&
          card &&
          board.columns
            .filter((column) => column.id !== card.column)
            .map((column) => (
              <Button
                key={column.id}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void run('kanban_card_move', {
                    board: board.stem,
                    card: card.id,
                    column: column.id
                  })
                }}
              >
                {t('aero.kanban.moveTo', 'Move to {{column}}', { column: column.title })}
              </Button>
            ))}
      </div>
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEdit(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.kind === 'board'
                ? t('aero.kanban.newBoard', 'New board')
                : card
                  ? t('aero.kanban.editCard', 'Edit card')
                  : t('aero.kanban.newCard', 'New card')}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!edit || !title.trim()) {
                return
              }
              const args =
                edit.kind === 'board'
                  ? { board: title.trim() }
                  : {
                      board: board?.stem,
                      title: title.trim(),
                      desc,
                      ...(edit.card
                        ? {
                            card: edit.card.id,
                            subtasks: tasks
                              .split('\n')
                              .filter((line) => line.trim())
                              .map((line) => ({
                                title: line.replace(/^\s*\[[ xX]\]\s*/, '').trim(),
                                done: /^\s*\[[xX]\]/.test(line)
                              }))
                          }
                        : {})
                    }
              void run(
                edit.kind === 'board'
                  ? 'kanban_board_create'
                  : edit.card
                    ? 'kanban_card_update'
                    : 'kanban_card_add',
                args
              )
            }}
          >
            <Label className="block">
              <span>{t('aero.kanban.cardTitle', 'Title')}</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={busy}
              />
            </Label>
            {edit?.kind === 'card' && (
              <Label className="block">
                <span>{t('aero.kanban.description', 'Description')}</span>
                <Textarea
                  value={desc}
                  onChange={(event) => setDesc(event.target.value)}
                  disabled={busy}
                />
              </Label>
            )}
            {edit?.card && (
              <Label className="block">
                <span>
                  {t('aero.kanban.subtaskLines', 'Subtasks · one per line, [x] marks complete')}
                </span>
                <Textarea
                  value={tasks}
                  onChange={(event) => setTasks(event.target.value)}
                  disabled={busy}
                />
              </Label>
            )}
            {error && (
              <p role="alert" className="break-words text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !title.trim()}>
              {t('aero.kanban.save', 'Save')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
