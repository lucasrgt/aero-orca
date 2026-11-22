import { Bell } from 'lucide-react'
import { AgentWorkingSpinner } from '@/components/agent/status/AgentWorkingSpinner'
import { useTranslate } from '@/i18n/use-translate'

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function SidebarActivityBadge({
  counts
}: {
  counts: { attention: number; working: number }
}): React.JSX.Element {
  const t = useTranslate()

  if (counts.attention > 0) {
    const label = t('dashboardPopout.bucket.attention', 'Needs You')
    return (
      <span
        className="relative inline-flex size-6 items-center justify-center"
        aria-label={`${label}: ${counts.attention}`}
      >
        <Bell className="size-3.5" aria-hidden="true" />
        <span className="absolute right-0 top-0 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-agent-question px-0.5 text-[9px] font-bold leading-none tabular-nums text-white ring-[1.5px] ring-worktree-sidebar">
          {formatCount(counts.attention)}
        </span>
      </span>
    )
  }

  if (counts.working > 0) {
    const label = t('dashboardPopout.bucket.working', 'Working')
    return (
      <span
        className="inline-flex items-center gap-1 px-1"
        aria-label={`${label}: ${counts.working}`}
      >
        <AgentWorkingSpinner className="size-2.5" />
        <span className="text-2xs font-semibold leading-none tabular-nums text-worktree-sidebar-foreground">
          {formatCount(counts.working)}
        </span>
      </span>
    )
  }

  const idleLabel = t('dashboardPopout.bucket.idle', 'Idle')
  return (
    <span className="inline-flex size-6 items-center justify-center" aria-label={`${idleLabel}: 0`}>
      <Bell className="size-3.5" aria-hidden="true" />
    </span>
  )
}
