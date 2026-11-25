import React from 'react'
import { AttachedWorktreeCards } from '@/components/sidebar/AttachedWorktreeCards'
import { useTranslate } from '@/i18n/use-translate'
import type { Bot } from '../../../../shared/bot-types'
import {
  botSidebarWorkerPagingLabel,
  type BotSidebarChatView
} from '../../../../shared/bots/bot-sidebar-tree'
import type { Worktree } from '../../../../shared/worktree/types'
import { BotChatPaging } from './BotChatRowControls'

type BotSidebarLineCardsProps = {
  bot: Bot
  notes: ReadonlyMap<string, string>
  lineageChildrenByParentIdentity: ReadonlyMap<string, Worktree[]>
  onOpen: () => void
}

/** Workspace lines no listed chat holds, shown right under the bot. */
export function BotSidebarStrayLines({
  bot,
  stray,
  notes,
  lineageChildrenByParentIdentity,
  onOpen
}: BotSidebarLineCardsProps & { stray: readonly Worktree[] }): React.JSX.Element | null {
  return stray.length > 0 ? (
    <AttachedWorktreeCards
      roots={stray}
      lineageChildrenByParentIdentity={lineageChildrenByParentIdentity}
      compactLine
      lineOwnerHostId={bot.hostId}
      lineNotes={notes}
      onOpen={onOpen}
    />
  ) : null
}

/** The workers of a bot's Home Chat shown directly under the bot, when that chat is its only listed one. */
export function BotSidebarHomeChatRows({
  home,
  onStep,
  ...cards
}: BotSidebarLineCardsProps & {
  home: BotSidebarChatView<Worktree>
  onStep: (chatId: string, steps: number) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  if (home.lines.length === 0) {
    return null
  }
  return (
    <>
      <AttachedWorktreeCards
        roots={home.lines}
        lineageChildrenByParentIdentity={cards.lineageChildrenByParentIdentity}
        compactLine
        lineOwnerHostId={cards.bot.hostId}
        lineNotes={cards.notes}
        onOpen={cards.onOpen}
      />
      <BotChatPaging
        more={
          home.paging
            ? [
                {
                  label: botSidebarWorkerPagingLabel(t, home.paging),
                  onClick: () => onStep(home.chat.chatId, home.steps + 1)
                }
              ]
            : []
        }
        onFewer={home.steps > 0 ? () => onStep(home.chat.chatId, 0) : null}
        className="pr-2 pb-1 pl-1"
      />
    </>
  )
}
