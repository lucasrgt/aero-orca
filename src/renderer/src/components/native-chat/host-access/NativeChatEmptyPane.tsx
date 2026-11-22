import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { useBotChatPersona } from '../../bots/bot-chat-persona'
import { useEmbeddedBotForTab } from '../../bots/bot-workspace'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { NativeChatInstallHero } from './NativeChatInstallHero'
import type { NativeChatInstallSlotState } from './NativeChatInstallSlot'
import { useNativeChatTabOwnerWorktreeId } from '../pane/ownership/use-native-chat-tab-owner'

export function NativeChatEmptyPane(props: {
  slot: NativeChatInstallSlotState
  agent: AgentType
  tabId: string
}): React.JSX.Element {
  const { slot, agent } = props
  const ownerWorktreeId = useNativeChatTabOwnerWorktreeId(props.tabId)
  const embeddedBot = useEmbeddedBotForTab(props.tabId)
  // A chat in a bot's home (or an embedded split view of a bot) greets as the bot.
  const persona = useBotChatPersona(ownerWorktreeId, embeddedBot)
  return slot.kind === 'install' ? (
    <NativeChatInstallHero slot={slot} agentLabel={structuredAgentLabel(agent)} />
  ) : (
    <NativeChatEmptyState kind="empty" agent={agent} persona={persona} />
  )
}
