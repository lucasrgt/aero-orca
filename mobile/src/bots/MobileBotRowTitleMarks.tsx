import { Text, View } from 'react-native'
import { Anchor, Compass, Lightbulb } from 'lucide-react-native'
import type { BotRole } from '../../../src/shared/bots/bot-fleet-role'
import { colors } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { MobileBotItemStatusIcon } from './items/MobileBotItemStatusIcon'

/** A bot's items that need you: an orange dot and the count, in the Up next count's muted style. */
export function MobileBotNeedsYouCount({ count }: { count: number }) {
  const t = useMobileTranslation()
  return (
    <View
      style={styles.upNext}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('bots.items.needYouCount', '{{count}} items need you', {
        count,
        defaultValue_one: '{{count}} item needs you'
      })}
    >
      <MobileBotItemStatusIcon status="needs_you" size={6} />
      <Text style={styles.count}>{count}</Text>
    </View>
  )
}

/** A bot's new Up next suggestions, in the fold's muted count style, as the desktop's lightbulb. */
export function MobileBotUpNextCount({ count }: { count: number }) {
  const t = useMobileTranslation()
  return (
    <View
      style={styles.upNext}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('bots.upNext.newInUpNext', '{{count}} new in Suggestions', { count })}
    >
      <Lightbulb size={12} color={colors.textMuted} />
      <Text style={styles.count}>{count}</Text>
    </View>
  )
}

/** Subtle nautical glyph rendered beside an Admiral or Territory Captain name. */
export function MobileBotFleetBadge({ role }: { role: BotRole }) {
  const t = useMobileTranslation()
  const label =
    role === 'admiral' ? t('bots.fleet.admiral', 'Admiral') : t('bots.fleet.captain', 'Captain')
  const Icon = role === 'admiral' ? Anchor : Compass
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.fleetBadge}>
      <Icon size={12} color={colors.textMuted} />
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  fleetBadge: { flexShrink: 0, opacity: 0.8 },
  count: { fontSize: 13, color: colors.textMuted },
  upNext: { flexDirection: 'row', alignItems: 'center', gap: 2 }
}))
