import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { useTranslate } from '@/i18n/use-translate'
import type { AeroKanbanPanelBoard } from '../../../../../shared/aero/aero-kanban-panel'
import { AeroBoardEditor } from './AeroBoardEditor'

export function AeroBoardCards({
  board,
  path,
  onChanged
}: {
  board: AeroKanbanPanelBoard
  path?: string
  onChanged?: () => Promise<void>
}): React.JSX.Element {
  const t = useTranslate()
  const columns = [...board.columns]
  for (const card of board.cards) {
    if (!columns.some((column) => column.id === card.column)) {
      columns.push({
        id: card.column,
        title: card.column || t('aero.kanban.unassigned', 'Unassigned')
      })
    }
  }
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
      {columns.map((column) => {
        const cards = board.cards.filter((card) => card.column === column.id)
        return (
          <section key={column.id} className="mb-4" aria-label={column.title}>
            <h3 className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              {column.title}
              <span>{cards.length}</span>
            </h3>
            {cards.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                {t('aero.kanban.emptyColumn', 'No cards')}
              </p>
            ) : (
              <Accordion type="multiple">
                {cards.map((card) => (
                  <AccordionItem key={card.id} value={card.id}>
                    <AccordionTrigger>
                      <span className="min-w-0 break-words">{card.title || card.id}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {path && onChanged && (
                          <AeroBoardEditor
                            key={`${path}:${board.stem}:${card.id}`}
                            path={path}
                            board={board}
                            card={card}
                            onChanged={onChanged}
                          />
                        )}
                        {card.priority && <Badge variant="secondary">{card.priority}</Badge>}
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {card.desc || t('aero.kanban.noDescription', 'No description')}
                        </p>
                        {card.subtasks.length > 0 && (
                          <p className="whitespace-pre-wrap text-xs">
                            {card.subtasks
                              .map((task) => `${task.done ? '✓' : '○'} ${task.title}`)
                              .join('\n')}
                          </p>
                        )}
                        <p className="break-all font-mono text-xs text-muted-foreground">
                          {card.id}
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </section>
        )
      })}
    </div>
  )
}
