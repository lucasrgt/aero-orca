import React, { useState } from 'react'
import { Anchor, Bot as BotIcon, Compass, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { BOT_TERRITORY_MAX_LENGTH, type BotRole } from '../../../../shared/bots/bot-fleet-role'
import type { BotFleetChildPosition } from '../../../../shared/bots/bot-project-groups'
import { BotProjectPicker } from './BotProjectPicker'

/** Project + Fleet role/territory group rendered together in NewBotDialog. */
export function NewBotPlacementFields({
  project,
  role,
  territory,
  onProjectChange,
  onRoleChange,
  onTerritoryChange
}: {
  project: string
  role: BotRole | null
  territory: string
  onProjectChange: (next: string) => void
  onRoleChange: (next: BotRole | null) => void
  onTerritoryChange: (next: string) => void
}): React.JSX.Element {
  return (
    <>
      <BotProjectPicker value={project} onChange={onProjectChange} />
      <BotFleetRolePicker
        role={role}
        territory={territory}
        onRoleChange={onRoleChange}
        onTerritoryChange={onTerritoryChange}
      />
    </>
  )
}

/** Indents a Territory Captain under its project Admiral with a continuous subtle vertical rail. */
export function BotFleetChildFrame({
  position,
  children
}: {
  position: BotFleetChildPosition
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div data-bot-fleet-child={position} className="relative pl-4">
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-3 w-px rounded-full bg-[color-mix(in_srgb,var(--worktree-sidebar-border)_75%,transparent)]',
          position === 'first' && 'top-0.5 bottom-0',
          position === 'middle' && 'inset-y-0',
          position === 'last' && 'top-0 bottom-2',
          position === 'only' && 'top-0.5 bottom-2'
        )}
      />
      {children}
    </div>
  )
}

/** Subtle nautical icon shown beside an Admiral or Territory Captain name in the sidebar. */
export function BotFleetRoleBadge({
  role,
  territory
}: {
  role: BotRole
  territory?: string | null
}): React.JSX.Element {
  const t = useTranslate()
  const label =
    role === 'admiral'
      ? t('bots.fleet.admiral', 'Admiral')
      : territory?.trim()
        ? t('bots.fleet.captainWithTerritory', 'Captain — {{territory}}', {
            territory: territory.trim()
          })
        : t('bots.fleet.captain', 'Captain')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          data-bot-fleet-role={role}
          className="inline-flex shrink-0 items-center text-muted-foreground/75"
        >
          {role === 'admiral' ? (
            <Anchor className="size-3" aria-hidden="true" />
          ) : (
            <Compass className="size-3" aria-hidden="true" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Compact Admiral / Captain / Standard selector plus optional territory input. */
export function BotFleetRolePicker({
  role,
  territory,
  onRoleChange,
  onTerritoryChange,
  disabled = false,
  mode = 'inline'
}: {
  role: BotRole | null
  territory: string
  onRoleChange: (next: BotRole | null) => void
  onTerritoryChange: (next: string) => void
  disabled?: boolean
  mode?: 'inline' | 'page'
}): React.JSX.Element {
  const t = useTranslate()
  const [draft, setDraft] = useState(territory)
  const inputValue = mode === 'inline' ? territory : draft
  const commitTerritory = (next: string): void => {
    const trimmed = next.trim()
    setDraft(trimmed)
    onTerritoryChange(trimmed)
  }

  const choices: readonly {
    value: BotRole | null
    label: string
    icon: React.ReactNode
  }[] = [
    {
      value: null,
      label: t('bots.fleet.standard', 'Standard'),
      icon: <BotIcon className="size-3 shrink-0" aria-hidden />
    },
    {
      value: 'admiral',
      label: t('bots.fleet.admiral', 'Admiral'),
      icon: <Anchor className="size-3 shrink-0" aria-hidden />
    },
    {
      value: 'captain',
      label: t('bots.fleet.captain', 'Captain'),
      icon: <Compass className="size-3 shrink-0" aria-hidden />
    }
  ]

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={t('bots.fleet.label', 'Fleet role')}
      >
        {choices.map((choice) => {
          const selected = role === choice.value
          return (
            <button
              key={choice.value ?? 'standard'}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onRoleChange(choice.value)}
              className={cn(
                'inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                selected
                  ? 'border-foreground/25 bg-accent font-medium text-foreground'
                  : 'border-border/70 bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              {choice.icon}
              <span>{choice.label}</span>
            </button>
          )
        })}
      </div>
      {role === 'captain' ? (
        <div className="relative flex items-center gap-1.5">
          <Compass
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60"
            aria-hidden
          />
          <Input
            value={inputValue}
            disabled={disabled}
            maxLength={BOT_TERRITORY_MAX_LENGTH}
            inset="leadingIcon"
            adornment={inputValue ? 'trailing' : 'none'}
            placeholder={t(
              'bots.fleet.territoryPlaceholder',
              'Territory scope (e.g. apps/travelers, backend/...)'
            )}
            aria-label={t('bots.fleet.territory', 'Territory')}
            onChange={(event) => {
              if (mode === 'inline') {
                onTerritoryChange(event.target.value)
              } else {
                setDraft(event.target.value)
              }
            }}
            onBlur={() => {
              if (mode === 'page' && draft.trim() !== territory.trim()) {
                commitTerritory(draft)
              }
            }}
            onKeyDown={(event) => {
              if (mode === 'page' && event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                commitTerritory(draft)
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
              aria-label={t('bots.fleet.clearTerritory', 'Clear territory')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitTerritory('')}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
