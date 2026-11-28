import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslate } from '@/i18n/use-translate'
import type {
  AeroKanbanPanelApi,
  AeroKanbanPanelCard
} from '../../../../../shared/aero/aero-kanban-panel'

type Mutation = Parameters<AeroKanbanPanelApi['mutate']>[0]

export function AeroCardDossier({
  path,
  board,
  card,
  onChanged
}: {
  path: string
  board: string
  card: AeroKanbanPanelCard
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const t = useTranslate()
  const field = useId()
  const alive = useRef(true)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function run(tool: Mutation['tool'], args: Mutation['args']) {
    if (pending.current) {
      return
    }
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await window.api.aeroKanban.mutate({ path, tool, args: { board, card: card.id, ...args } })
      if (alive.current) {
        setReference('')
        await onChanged()
      }
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    pending.current = false
    if (alive.current) {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="break-all font-mono text-xs text-muted-foreground">
        {board}/{card.id}
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (reference.trim()) {
            void run('kanban_card_link', { blocked_by: reference.trim() })
          }
        }}
      >
        <Label htmlFor={field}>{t('aero.kanban.blockedBy', 'Blocked by · board/card')}</Label>
        <Input
          id={field}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          disabled={busy}
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !reference.trim()}>
          {t('aero.kanban.linkCard', 'Link dependency')}
        </Button>
      </form>
      {(card.blockedBy ?? []).map((upstream) => (
        <div key={upstream} className="flex items-center justify-between gap-2">
          <span className="break-all text-xs">{upstream}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void run('kanban_card_unlink', { blocked_by: upstream })
            }}
          >
            {t('aero.kanban.unlink', 'Unlink')}
          </Button>
        </div>
      ))}
      {(card.blocks ?? []).length > 0 && (
        <p className="break-words text-xs">
          {t('aero.kanban.blocks', 'Blocks: {{cards}}', { cards: card.blocks?.join(', ') })}
        </p>
      )}
      {(card.clarifications ?? []).map((question) => (
        <AeroQuestionAnswer
          key={question.id}
          question={question}
          busy={busy}
          onAnswer={(answer) => {
            void run('kanban_card_answer', { answers: [{ id: question.id, answer }] })
          }}
        />
      ))}
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function AeroQuestionAnswer({
  question,
  busy,
  onAnswer
}: {
  question: NonNullable<AeroKanbanPanelCard['clarifications']>[number]
  busy: boolean
  onAnswer: (answer: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const field = useId()
  const [answer, setAnswer] = useState('')
  if (question.answer) {
    return (
      <div className="space-y-1 text-sm">
        <p>{question.question}</p>
        <p className="whitespace-pre-wrap break-words">{question.answer}</p>
      </div>
    )
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (answer.trim()) {
          onAnswer(answer.trim())
        }
      }}
    >
      <Label htmlFor={field}>{question.question}</Label>
      {question.options.length > 0 && (
        <p className="text-xs text-muted-foreground">{question.options.join(' · ')}</p>
      )}
      <Input
        id={field}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={busy}
        required
      />
      <Button type="submit" size="sm" disabled={busy || !answer.trim()}>
        {t('aero.kanban.answer', 'Answer')}
      </Button>
    </form>
  )
}
