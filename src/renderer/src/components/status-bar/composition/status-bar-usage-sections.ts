import type {
  ProviderRateLimits,
  RateLimitWindow
} from '../../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { StatusBarUsageMode } from '../../../../../shared/status-bar/status-bar-usage-mode'
import { isCursorUsageBucket } from '../../../../../shared/agent-usage/rate-limits/cursor-usage-buckets'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { formatRateLimitWindowChipLabel } from '../../../../../shared/agent-usage/rate-limits/rate-limit-window-label'
import { formatWindowLabel } from '../usage/rate-limit-window-localized-label'
import { getUsageHeadlineSection } from '../usage/usage-headline-sections'

export type StatusBarUsageSection = {
  key: string
  window: RateLimitWindow
  label: string
  labelFirst?: boolean
}

const STATUS_BAR_BUCKET_NAMES = new Set(['Flash', 'Pro', '1.5 Pro'])

export function getStatusBarUsageSections(
  p: ProviderRateLimits | null,
  mode: StatusBarUsageMode,
  t: Translate = translate
): StatusBarUsageSection[] {
  if (!p || p.status === 'idle' || p.status === 'unavailable') {
    return []
  }
  if (mode === 'compact') {
    // Prefer primary windows (e.g. Claude weekly) before falling back to scoped-only snapshots like Fable.
    const headline =
      getUsageHeadlineSection(p, t, 'primary') ?? getUsageHeadlineSection(p, t, 'all')
    if (!headline) {
      return []
    }
    // Why: named pools read "Cursor Models 64%" in Detailed, so Compact keeps that order.
    const isNamedBucket = p.buckets?.some((bucket) => bucket === headline.window) ?? false
    return [{ key: 'headline', ...headline, labelFirst: isNamedBucket }]
  }
  if (p.buckets?.length) {
    // Antigravity pool names vary by account tier; Gemini's experimental pools stay hidden.
    const buckets = p.buckets.filter(
      (bucket) =>
        p.provider === 'antigravity' ||
        STATUS_BAR_BUCKET_NAMES.has(bucket.name) ||
        isCursorUsageBucket(bucket.name)
    )
    if (buckets.length > 0) {
      return buckets.map((bucket) => ({
        key: bucket.name,
        window: bucket,
        label: bucket.name,
        labelFirst: true
      }))
    }
    const fallback = p.session ?? p.monthly ?? p.weekly
    return fallback
      ? [{ key: 'fallback', window: fallback, label: formatRateLimitWindowChipLabel(fallback) }]
      : []
  }
  return [
    p.session
      ? { key: 'session', window: p.session, label: formatRateLimitWindowChipLabel(p.session) }
      : null,
    p.weekly
      ? {
          key: 'weekly',
          window: p.weekly,
          label:
            p.provider === 'claude'
              ? formatWindowLabel(p.weekly.windowMinutes)
              : formatRateLimitWindowChipLabel(p.weekly)
        }
      : null,
    // Keep Fable out of the status bar when Claude has primary windows; it stays available in the popover.
    p.fableWeekly && !p.session && !p.weekly
      ? {
          key: 'fableWeekly',
          window: p.fableWeekly,
          label: t('auto.components.status.bar.StatusBar.a79c64f87e', 'Fable')
        }
      : null,
    // Monthly-only providers keep their limit inline; other plans show it in the details.
    p.monthly && !p.session && !p.weekly
      ? { key: 'monthly', window: p.monthly, label: formatRateLimitWindowChipLabel(p.monthly) }
      : null
  ].filter((section) => section !== null)
}
