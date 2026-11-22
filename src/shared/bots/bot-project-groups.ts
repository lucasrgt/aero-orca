import * as z from 'zod'
import type { BotSidebarGroupBy } from './bot-sidebar-view'
import { botRoleSortRank, type BotRole } from './bot-fleet-role'

export const BOT_PROJECT_MAX_LENGTH = 80
export const BotProjectSchema = z
  .string()
  .trim()
  .max(BOT_PROJECT_MAX_LENGTH)
  .refine((name) => !/\p{Cc}/u.test(name), 'Project names cannot contain control characters')

export const BOT_PROJECT_COLLAPSE_PREFIX = 'bot-project:'
export const BOT_PROJECT_GENERAL_KEY = '__general__'

export function botProjectCollapseKey(projectKey: string): string {
  return `${BOT_PROJECT_COLLAPSE_PREFIX}${projectKey}`
}

export function normalizeBotProjectKey(project: string | null | undefined): string | null {
  const trimmed = project?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

type GroupableBotEntry =
  | { id: string; kind: 'bot'; bot: { project?: string | null; role?: BotRole | null } }
  | { id: string; kind: 'group' }

function sortGroupItemsByFleetRole<E extends GroupableBotEntry>(
  items: readonly { entry: E; originalIndex: number }[]
): { entry: E; originalIndex: number }[] {
  return [...items].sort((a, b) => {
    const rankA = a.entry.kind === 'bot' ? botRoleSortRank(a.entry.bot.role) : 3
    const rankB = b.entry.kind === 'bot' ? botRoleSortRank(b.entry.bot.role) : 3
    return rankA - rankB
  })
}

export type BotSidebarVirtualRow<E extends GroupableBotEntry> =
  | {
      kind: 'project-header'
      id: string
      projectKey: string
      label: string | null
      count: number
      collapsed: boolean
      isGeneral: boolean
      afterGlobalAdmiral?: boolean
    }
  | {
      kind: 'fleet-divider'
      id: string
      projectKey: string
      count: number
    }
  | {
      kind: 'entry'
      id: string
      entry: E
      originalIndex: number
      grouped: boolean
    }

function pushFleetRows<E extends GroupableBotEntry>(
  rows: BotSidebarVirtualRow<E>[],
  projectKey: string,
  sortedItems: readonly { entry: E; originalIndex: number }[]
): void {
  const captainCount = sortedItems.filter(
    ({ entry }) => entry.kind === 'bot' && entry.bot.role === 'captain'
  ).length
  let sawAdmiral = false
  let insertedDivider = false
  for (const item of sortedItems) {
    const role = item.entry.kind === 'bot' ? item.entry.bot.role : null
    if (role === 'admiral') {
      sawAdmiral = true
    } else if (sawAdmiral && !insertedDivider && role === 'captain') {
      rows.push({
        kind: 'fleet-divider',
        id: `bot-fleet-divider:${projectKey}`,
        projectKey,
        count: captainCount
      })
      insertedDivider = true
    }
    rows.push({
      kind: 'entry',
      id: item.entry.id,
      entry: item.entry,
      originalIndex: item.originalIndex,
      grouped: true
    })
  }
}

/**
 * Projects a flat list of arranged bot sidebar entries into virtual rows, inserting
 * collapsible project headers when `groupBy === 'project'` and at least one bot has a project.
 */
export function buildBotSidebarRows<E extends GroupableBotEntry>(
  entries: readonly E[],
  groupBy: BotSidebarGroupBy,
  collapsedGroups: ReadonlySet<string>
): { rows: BotSidebarVirtualRow<E>[]; grouped: boolean } {
  const hasAnyProject =
    groupBy === 'project' &&
    entries.some(
      (entry) => entry.kind === 'bot' && normalizeBotProjectKey(entry.bot.project) !== null
    )
  if (!hasAnyProject) {
    return {
      grouped: false,
      rows: entries.map((entry, originalIndex) => ({
        kind: 'entry',
        id: entry.id,
        entry,
        originalIndex,
        grouped: false
      }))
    }
  }

  const globalAdmirals: { entry: E; originalIndex: number }[] = []
  const buckets = new Map<string, { label: string; items: { entry: E; originalIndex: number }[] }>()
  const general: { entry: E; originalIndex: number }[] = []

  entries.forEach((entry, originalIndex) => {
    const key = entry.kind === 'bot' ? normalizeBotProjectKey(entry.bot.project) : null
    if (!key) {
      if (entry.kind === 'bot' && entry.bot.role === 'admiral') {
        globalAdmirals.push({ entry, originalIndex })
      } else {
        general.push({ entry, originalIndex })
      }
      return
    }
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push({ entry, originalIndex })
    } else {
      buckets.set(key, {
        label: entry.kind === 'bot' ? entry.bot.project!.trim() : key,
        items: [{ entry, originalIndex }]
      })
    }
  })

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  const sortedKeys = [...buckets.keys()].sort((a, b) =>
    collator.compare(buckets.get(a)!.label, buckets.get(b)!.label)
  )

  const rows: BotSidebarVirtualRow<E>[] = []
  for (const item of globalAdmirals) {
    rows.push({
      kind: 'entry',
      id: item.entry.id,
      entry: item.entry,
      originalIndex: item.originalIndex,
      grouped: false
    })
  }
  for (let projectIndex = 0; projectIndex < sortedKeys.length; projectIndex += 1) {
    const projectKey = sortedKeys[projectIndex]!
    const bucket = buckets.get(projectKey)!
    const collapsed = collapsedGroups.has(botProjectCollapseKey(projectKey))
    rows.push({
      kind: 'project-header',
      id: `bot-project-header:${projectKey}`,
      projectKey,
      label: bucket.label,
      count: bucket.items.length,
      collapsed,
      isGeneral: false,
      ...(projectIndex === 0 && globalAdmirals.length > 0 ? { afterGlobalAdmiral: true } : {})
    })
    if (!collapsed) {
      pushFleetRows(rows, projectKey, sortGroupItemsByFleetRole(bucket.items))
    }
  }

  if (general.length > 0) {
    const collapsed = collapsedGroups.has(botProjectCollapseKey(BOT_PROJECT_GENERAL_KEY))
    rows.push({
      kind: 'project-header',
      id: `bot-project-header:${BOT_PROJECT_GENERAL_KEY}`,
      projectKey: BOT_PROJECT_GENERAL_KEY,
      label: null,
      count: general.length,
      collapsed,
      isGeneral: true
    })
    if (!collapsed) {
      for (const item of sortGroupItemsByFleetRole(general)) {
        rows.push({
          kind: 'entry',
          id: item.entry.id,
          entry: item.entry,
          originalIndex: item.originalIndex,
          grouped: true
        })
      }
    }
  }

  return { rows, grouped: true }
}
