import type React from 'react'
import type { Bot, BotAgent } from '../../../../shared/bot-types'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { BotProposal } from '../../../../shared/bots/bot-proposal'
import type { BotCreateParams } from '../../../../shared/rpc-contract/bots-params'
import type { NewBotShareSource } from './sharing/new-bot-from-share'

export type NewBotDialogProps = {
  open: boolean
  /** Closed with `made` once that bot is created, else dismissed. */
  onOpenChange: (open: boolean, made?: Bot) => void
  onCreated?: (bot: Bot) => void
  /** A suggested name; mount the dialog when it opens so the suggestion is fresh. */
  initialName?: string
  /** A suggested purpose, seeded into SOUL.md like a typed one. */
  initialPurpose?: string
  /** Pre-selected project group in the sidebar. */
  initialProject?: string
  /** The agent picked at first, when this computer has it. */
  initialAgent?: BotAgent
  /** Made in Hand to bot: `onCreated` sends its first turn, once the workspace moved, even when its
   *  page could not open. */
  takingOver?: true
  /** A proposed bot (a template, a suggestion, a bot's card): prefills the dialog, and its purpose seeds
   *  the new bot's SOUL.md. Mount the dialog when it opens. */
  proposal?: BotProposal
  /** The bot-create card the proposal came from: the new bot is recorded against it. */
  fromOffer?: BotCreateParams['fromOffer']
  /** Where the proposal came from ("From Support triage, for your work"), in place of the description. */
  origin?: string
  /** Opened programmatically, it has no trigger to give focus back to on Cancel; this takes its place. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
  /** Offers bringing a bot over from another app instead, when this is the owner's first bot. */
  onImport?: () => void
  /** The computers it may go on; every one by default. */
  hosts?: readonly ExecutionHostId[]
  /** The computer of the bot that proposed it (`fromOffer`): picked first. Made on another computer,
   *  it is a plain new bot, since that bot and the workspaces it named aren't there. */
  offerHostId?: ExecutionHostId
  /** Made from a reviewed link, said in place of the description: its picture first, Ask picked first,
   *  and Back returns to the review.
   *  Create writes the reviewed bot, so there is no purpose to type. */
  fromShare?: NewBotShareSource
}
