import { botTidyUp, patchTidyUp } from '../bots/bot-tidy-up'
import {
  botMemberSource,
  botSlackApps,
  withoutBotMember,
  withSlackMembersTagged,
  type Bot,
  type BotMember
} from '../bot-types'
import { botMembersFullError, planBotMemberAdds } from '../bots/bot-member-capacity'
import { botLookAround, patchLookAround } from '../bots/bot-look-around'
import { withBotOfferAnswer } from '../bots/bot-offer-answers'
import { withBotCancelledWait } from '../bots/bot-cancelled-waits'
import type { BotHostUpdates, BotUpdateParams } from './bots-params'

/** Who can ask after the people an update takes off and adds, applied to the list the host has now.
 *  Throws botMembersFullError, saving nothing, when an add would pass a limit. */
export function applyBotMemberUpdates(
  members: readonly BotMember[],
  updates: Pick<BotUpdateParams['updates'], 'removeMember' | 'removeMembers' | 'addMembers'>
): BotMember[] {
  const { removeMember, removeMembers = [], addMembers = [] } = updates
  let next = [...members]
  for (const key of [...(removeMember ? [removeMember] : []), ...removeMembers]) {
    next = withoutBotMember(next, key)
  }
  const plan = planBotMemberAdds(next, addMembers)
  if (!plan.ok) {
    throw botMembersFullError(plan.full)
  }
  return plan.members
}

/** A null permission mode clears the override, so the bot's chats follow the native chat default. */
export function applyBotUpdates(bot: Bot, updates: BotHostUpdates): Bot {
  const {
    permissionMode,
    launch,
    removeMember,
    removeMembers,
    addMembers,
    lookAround,
    tidyUp,
    offerAnswer,
    cancelledWait,
    project,
    soul: _soul,
    ...rest
  } = updates
  const next: Bot = { ...bot, ...rest }
  if (project === null || project === '') {
    delete next.project
  } else if (project !== undefined) {
    next.project = project
  }
  if (offerAnswer) {
    next.offerAnswers = withBotOfferAnswer(bot.offerAnswers, offerAnswer)
  }
  if (cancelledWait) {
    next.cancelledWaits = withBotCancelledWait(bot.cancelledWaits, cancelledWait)
  }
  if (lookAround) {
    next.lookAround = patchLookAround(botLookAround(bot), lookAround, Date.now())
  }
  if (tidyUp) {
    next.tidyUp = patchTidyUp(botTidyUp(bot), tidyUp, Date.now())
  }
  next.members = applyBotMemberUpdates(next.members, { removeMember, removeMembers, addMembers })
  // `slack` and `linear` mirror the first of their lists, for readers that know one workspace.
  if (rest.slackApps) {
    next.slack = rest.slackApps[0] ?? null
  } else if (rest.slack !== undefined) {
    next.slackApps = rest.slack ? [rest.slack] : []
  }
  if (next.slackApps) {
    // A workspace's people go with it, so a removed workspace never hands them to another.
    // Untagged people are the first workspace's as it was before this update.
    const first = botSlackApps(bot)[0] ?? botSlackApps(next)[0]
    const teams = new Set(next.slackApps.map((app) => app.teamId))
    const tagged = withSlackMembersTagged({
      members: next.members,
      slack: null,
      slackApps: first ? [first] : []
    }).members
    next.members = tagged.filter(
      (member) =>
        botMemberSource(member) !== 'slack' ||
        member.workspaceId === undefined ||
        teams.has(member.workspaceId)
    )
  }
  if (rest.linearWorkspaces) {
    next.linear = rest.linearWorkspaces[0] ?? null
  } else if (rest.linear !== undefined) {
    next.linearWorkspaces = rest.linear ? [rest.linear] : []
  }
  if (permissionMode === null) {
    delete next.permissionMode
  } else if (permissionMode !== undefined) {
    next.permissionMode = permissionMode
  }
  if (launch) {
    next.launch = launch
  } else if (launch === null || (rest.agent !== undefined && rest.agent !== bot.agent)) {
    delete next.launch
  }
  return next
}
