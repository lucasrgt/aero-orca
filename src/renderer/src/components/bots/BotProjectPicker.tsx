import React, { useMemo, useState, useSyncExternalStore } from 'react'
import { Check, ChevronDown, Folder, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { useTranslate } from '@/i18n/use-translate'
import { readBots, subscribeToBotChanges } from '@/lib/bot-catalog-snapshot'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'
import {
  BOT_PROJECT_MAX_LENGTH,
  normalizeBotProjectKey
} from '../../../../shared/bots/bot-project-groups'
import type { Repo } from '../../../../shared/repository/repo-types'

export type BotProjectSuggestion = {
  key: string
  label: string
  repo: Repo | null
}

/** Known project choices for bots: Orca's registered repos first, then custom project labels used by existing bots. */
export function useBotProjectSuggestions(): BotProjectSuggestion[] {
  const repos = useAppStore((state) => state.repos)
  const bots = useSyncExternalStore(subscribeToBotChanges, readBots, readBots)
  return useMemo(() => {
    const byKey = new Map<string, BotProjectSuggestion>()
    for (const repo of repos) {
      if (repo.hiddenAt) {
        continue
      }
      const label = (repo.displayName || '').trim()
      const key = normalizeBotProjectKey(label)
      if (!key || byKey.has(key)) {
        continue
      }
      byKey.set(key, { key, label, repo })
    }
    for (const bot of bots) {
      const label = bot.project?.trim()
      const key = normalizeBotProjectKey(label)
      if (!key || !label || byKey.has(key)) {
        continue
      }
      byKey.set(key, { key, label, repo: null })
    }
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
    return [...byKey.values()].sort((a, b) => collator.compare(a.label, b.label))
  }, [repos, bots])
}

/** Matches a bot's project label to a registered Orca repo (case-insensitive) to reuse its icon and color. */
export function findRepoForBotProject(
  project: string | null | undefined,
  repos: readonly Repo[]
): Repo | null {
  const key = normalizeBotProjectKey(project)
  if (!key) {
    return null
  }
  return repos.find((repo) => normalizeBotProjectKey(repo.displayName) === key) ?? null
}

export function BotProjectHeaderRow({
  projectKey,
  label,
  count,
  collapsed,
  isGeneral,
  repos,
  onToggle,
  onNewBot
}: {
  projectKey: string
  label: string | null
  count: number
  collapsed: boolean
  isGeneral: boolean
  repos: readonly Repo[]
  onToggle: () => void
  onNewBot: (project: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const title = label ?? t('bots.project.general', 'General')
  return (
    <div
      data-bot-project-header={projectKey}
      className="group/bot-project mt-1 flex h-6.5 items-center gap-1 pr-1 pl-1.5 first:mt-0"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-worktree-sidebar-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
      >
        <BotProjectGlyph project={label} repos={repos} className="size-3.5" />
        <span className="min-w-0 truncate">{title}</span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground/60 transition-transform motion-reduce:transition-none',
            collapsed && '-rotate-90'
          )}
        />
        <span className="ml-auto shrink-0 text-2xs font-normal text-muted-foreground/70 tabular-nums">
          {count}
        </span>
      </button>
      {!isGeneral && label ? (
        <span className="shrink-0 opacity-0 transition-opacity group-hover/bot-project:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5"
            aria-label={t('bots.project.newBotIn', 'New bot in {{project}}', { project: label })}
            onClick={() => onNewBot(label)}
          >
            <Plus className="size-3" />
          </Button>
        </span>
      ) : null}
    </div>
  )
}

export function BotProjectGlyph({
  project,
  repos,
  className = 'size-3.5'
}: {
  project: string | null | undefined
  repos: readonly Repo[]
  className?: string
}): React.JSX.Element {
  const repo = findRepoForBotProject(project, repos)
  if (repo) {
    return (
      <RepoIconGlyph
        repoIcon={repo.repoIcon}
        color={repo.badgeColor}
        className={cn('shrink-0', className)}
        iconClassName={className}
      />
    )
  }
  return <Folder className={cn('shrink-0 text-muted-foreground', className)} aria-hidden />
}

/** Compact project selector used in New bot and Bot settings: pick a registered project or type any label. */
export function BotProjectPicker({
  value,
  onChange,
  disabled = false,
  mode = 'inline'
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  mode?: 'inline' | 'page'
}): React.JSX.Element {
  const t = useTranslate()
  const suggestions = useBotProjectSuggestions()
  const currentKey = normalizeBotProjectKey(value)
  const [draft, setDraft] = useState(value)

  const inputValue = mode === 'inline' ? value : draft
  const commit = (next: string): void => {
    const trimmed = next.trim()
    setDraft(trimmed)
    onChange(trimmed)
  }

  return (
    <div className="space-y-2">
      <div className="relative flex items-center gap-1.5">
        <Folder
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60"
          aria-hidden
        />
        <Input
          value={inputValue}
          disabled={disabled}
          maxLength={BOT_PROJECT_MAX_LENGTH}
          inset="leadingIcon"
          adornment={inputValue ? 'trailing' : 'none'}
          placeholder={t('bots.project.placeholder', 'Project (optional)')}
          aria-label={t('bots.project.label', 'Project')}
          onChange={(event) => {
            if (mode === 'inline') {
              onChange(event.target.value)
            } else {
              setDraft(event.target.value)
            }
          }}
          onBlur={() => {
            if (mode === 'page' && draft.trim() !== (value ?? '').trim()) {
              commit(draft)
            }
          }}
          onKeyDown={(event) => {
            if (mode === 'page' && event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              commit(draft)
            }
          }}
        />
        {inputValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            className="absolute top-1/2 right-1 size-5 -translate-y-1/2"
            aria-label={t('bots.project.clear', 'Clear project')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit('')}
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((item) => {
            const selected = currentKey === item.key
            return (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => commit(selected ? '' : item.label)}
                className={cn(
                  'inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                  selected
                    ? 'border-foreground/25 bg-accent text-foreground font-medium'
                    : 'border-border/70 bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                {item.repo ? (
                  <RepoIconGlyph
                    repoIcon={item.repo.repoIcon}
                    color={item.repo.badgeColor}
                    className="size-3 shrink-0"
                    iconClassName="size-3"
                  />
                ) : (
                  <Folder className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate">{item.label}</span>
                {selected ? <Check className="size-3 shrink-0" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
