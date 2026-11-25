import { BookOpen, Plug, Users, Wrench } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { useAccessRequests } from '@/lib/bot-access-requests'
import { useAppStore } from '@/store'
import { botMembersFrom, type Bot } from '../../../../../shared/bot-types'
import { botSkillSourceNames, useBotOwnSkills } from '../../settings/bots/use-bot-skill-projects'
import { ACCOUNT_CONNECTORS, useBotConnectorState } from '../bot-connectors'
import { countValue, whoCanAskValue } from '../bot-settings-row-states'
import { useBotTools } from '../bot-tool-checks'
import type { BotSettingsPage } from './bot-settings-place'
import { SettingsInsetGroup, SettingsInsetRow } from './BotSettingsRows'

function useAccessValues(bot: Bot): { connectors: string; whoCanAsk: string } {
  const state = useBotConnectorState(bot)
  const requests = useAccessRequests().filter(
    (request) => request.botId === bot.id && request.hostId === bot.hostId
  ).length
  const people = ACCOUNT_CONNECTORS.filter((connector) => connector.id !== 'google').reduce(
    (sum, connector) => sum + botMembersFrom(bot.members, connector.id).length,
    0
  )
  return {
    connectors: countValue(state.catalog.filter(state.added).length),
    whoCanAsk: whoCanAskValue(people, requests)
  }
}

export function BotAccessSettingsGroup({
  bot,
  open
}: {
  bot: Bot
  open: (page: BotSettingsPage) => void
}): React.JSX.Element {
  const t = useTranslate()
  const values = useAccessValues(bot)
  const { view } = useBotTools(bot, 'finished')
  const repos = useAppStore((state) => state.repos)
  const own = useBotOwnSkills(bot)
  const skills = countValue(
    botSkillSourceNames(
      own,
      (bot.skillProjects ?? []).flatMap(
        (id) => repos.find((repo) => repo.id === id)?.displayName ?? []
      )
    ).length
  )
  return (
    <SettingsInsetGroup title={t('bots.settingsView.access', 'Access')}>
      <SettingsInsetRow
        icon={<Plug />}
        title={t('settings.bots.connectors', 'Connectors')}
        value={values.connectors}
        page="connectors"
        onOpen={() => open('connectors')}
      />
      <SettingsInsetRow
        icon={<Users />}
        title={t('bots.settingsView.whoCanAsk', 'Who can ask')}
        value={values.whoCanAsk}
        page="who-can-ask"
        onOpen={() => open('who-can-ask')}
      />
      <SettingsInsetRow
        icon={<Wrench />}
        title={t('settings.bots.tools.title', 'Tools')}
        value={
          view.status === 'ready'
            ? countValue(view.tools.own.length + view.tools.inherited.length)
            : null
        }
        page="tools"
        onOpen={() => open('tools')}
      />
      <SettingsInsetRow
        icon={<BookOpen />}
        title={t('settings.bots.skills.title', 'Skills')}
        value={skills}
        page="skills"
        onOpen={() => open('skills')}
      />
    </SettingsInsetGroup>
  )
}
