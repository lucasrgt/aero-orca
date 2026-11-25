import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'

/** The line under an approval's title naming the worker that asked, with a link into that worker. */
export function NativeChatApprovalWorkerLine({
  worker,
  quiet
}: {
  worker: { name: string; onOpen: () => void }
  quiet: boolean
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <p
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-xs',
        quiet ? 'text-chat-foreground-faint' : 'mt-0.5 text-muted-foreground'
      )}
    >
      <span className="truncate">
        {t('components.native-chat.approval.worker', 'Worker · {{name}}', {
          name: worker.name
        })}
      </span>
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-px shrink-0 bg-border/80 align-middle"
      />
      <button
        type="button"
        onClick={worker.onOpen}
        className={cn(
          'shrink-0 rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          quiet ? 'text-chat-foreground' : 'text-foreground'
        )}
      >
        {t('components.native-chat.approval.openWorker', 'Open worker')}
      </button>
    </p>
  )
}
