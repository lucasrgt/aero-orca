import { memo, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react-native'
import {
  botProjectCollapseKey,
  buildBotSidebarRows
} from '../../../../src/shared/bots/bot-project-groups'
import { botsOfflineWord } from '../../bots/host-bot-listing'
import { mobileBotAvatarSource } from '../../bots/host-bot-row-facts'
import { MobileBotFaceStack } from '../../bots/MobileBotFaceStack'
import {
  MobileBotFleetBadge,
  MobileBotNeedsYouCount,
  MobileBotRowAvatar,
  MobileBotRowStatus,
  MobileBotRowView
} from '../../bots/MobileBotHomeRow'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { HostContextPill } from '../../worktree/row-presentation/HostContextPill'
import { colors, feedback, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { HomeBotRow } from './home-bot-rows'

/** A bot or room on Home: the computer's Bots row, always naming where it runs. */
export const MobileHomeBotRow = memo(function MobileHomeBotRow(props: {
  row: HomeBotRow
  divider: boolean
  /** It sits on Feed's grouped panel, which its status ring matches. */
  grouped?: boolean
  onOpen: (row: HomeBotRow) => void
}) {
  useMobileColorScheme()
  const { row } = props
  const surface = props.grouped ? colors.bgPanel : undefined
  return (
    <MobileBotRowView
      avatar={
        row.kind === 'bot' ? (
          <MobileBotRowAvatar
            avatar={mobileBotAvatarSource(row.bot)}
            dot={row.dot}
            surface={surface}
          />
        ) : (
          <>
            <MobileBotFaceStack faces={row.faces} />
            <MobileBotRowStatus dot={row.dot} surface={surface} />
          </>
        )
      }
      title={row.title}
      titleBadge={
        row.kind === 'bot' && row.bot.role ? <MobileBotFleetBadge role={row.bot.role} /> : null
      }
      unread={row.unread}
      preview={row.preview}
      previewLeading={
        <HostContextPill
          hostId={row.executionHost}
          label={row.hostLabel}
          healthLabel={row.offline ? botsOfflineWord() : undefined}
        />
      }
      age={row.age}
      dimmed={row.offline === true || (row.kind === 'bot' && row.bot.paused)}
      divider={props.divider}
      onPress={() => props.onOpen(row)}
      titleTrailing={row.needsYou > 0 ? <MobileBotNeedsYouCount count={row.needsYou} /> : null}
    />
  )
})

/** Home's bot rows, kept from redrawing while their list is unchanged. */
export const MobileHomeBotRows = memo(function MobileHomeBotRows(props: {
  rows: readonly HomeBotRow[]
  grouped?: boolean
  onOpen: (row: HomeBotRow) => void
}) {
  useMobileColorScheme()
  return props.rows.map((row, index) => (
    <MobileHomeBotRow
      key={row.key}
      row={row}
      divider={index > 0}
      grouped={props.grouped}
      onOpen={props.onOpen}
    />
  ))
})

/** Project-grouped Bots list for Mobile Home: global Admirals pinned on top, then collapsible projects. */
export const MobileHomeBotProjectRows = memo(function MobileHomeBotProjectRows(props: {
  rows: readonly HomeBotRow[]
  collapsedProjects: ReadonlySet<string>
  onToggleProject: (collapseKey: string) => void
  onOpen: (row: HomeBotRow) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const virtualRows = useMemo(
    () =>
      buildBotSidebarRows(
        props.rows.map((row) =>
          row.kind === 'bot'
            ? { id: row.key, kind: 'bot' as const, bot: row.bot, row }
            : { id: row.key, kind: 'group' as const, row }
        ),
        'project',
        props.collapsedProjects
      ).rows,
    [props.rows, props.collapsedProjects]
  )

  return virtualRows.map((item, index) => {
    if (item.kind === 'project-header') {
      const Chevron = item.collapsed ? ChevronRight : ChevronDown
      const title = item.label ?? t('bots.project.general', 'General')
      return (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ expanded: !item.collapsed }}
          onPress={() => props.onToggleProject(botProjectCollapseKey(item.projectKey))}
          style={({ pressed }) => [
            projectHeaderStyles.header,
            index > 0 && projectHeaderStyles.headerGap,
            item.afterGlobalAdmiral && projectHeaderStyles.afterGlobalAdmiral,
            pressed && projectHeaderStyles.pressed
          ]}
        >
          <Folder size={13} color={colors.textMuted} />
          <Text numberOfLines={1} style={projectHeaderStyles.title}>
            {title}
          </Text>
          <Chevron size={13} color={colors.textMuted} />
          <Text style={projectHeaderStyles.count}>{item.count}</Text>
        </Pressable>
      )
    }
    if (item.kind === 'fleet-divider') {
      return (
        <View key={item.id} style={projectHeaderStyles.fleetDivider}>
          <View style={projectHeaderStyles.fleetDividerTick} />
          <Text style={projectHeaderStyles.fleetDividerLabel}>
            {t('bots.fleet.captainsDivider', 'Captains')}
          </Text>
          <View style={projectHeaderStyles.fleetDividerRule} />
          <Text style={projectHeaderStyles.fleetDividerCount}>{item.count}</Text>
        </View>
      )
    }
    const prev = virtualRows[index - 1]
    const showDivider = prev?.kind === 'entry'
    return (
      <MobileHomeBotRow
        key={item.id}
        row={item.entry.row}
        divider={showDivider}
        onOpen={props.onOpen}
      />
    )
  })
})

const projectHeaderStyles = themedStyleSheet(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  headerGap: {
    marginTop: spacing.sm
  },
  afterGlobalAdmiral: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  title: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted
  },
  count: {
    marginLeft: 'auto',
    fontSize: 11,
    color: colors.textMuted
  },
  fleetDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 2
  },
  fleetDividerTick: {
    width: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle
  },
  fleetDividerLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    opacity: 0.75
  },
  fleetDividerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle
  },
  fleetDividerCount: {
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.65
  },
  pressed: { opacity: feedback.pressedOpacity }
}))
