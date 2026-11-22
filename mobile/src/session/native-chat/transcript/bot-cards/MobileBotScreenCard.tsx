import { Text } from 'react-native'
import { Monitor } from 'lucide-react-native'
import type { NativeChatBotCardValues } from '../../../../../../src/shared/native-chat/bot-cards/native-chat-bot-card-kind'
import { useMobileTranslation } from '../../../../i18n/use-mobile-translation'
import { colors, typography } from '../../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../../theme/themed-styles'
import { scaledType } from '../messages/mobile-native-chat-message-styles'
import { MobileBotCardFrame, MobileBotCardMeta } from './MobileBotCardFrame'

export function MobileBotScreenCard({
  directive,
  fontScale = 1
}: {
  directive: NativeChatBotCardValues['screen']
  fontScale?: number
}): React.JSX.Element {
  const t = useMobileTranslation()
  const title = directive.title ?? directive.sandbox ?? t('chat.botCards.screen.title', 'PC screen')
  return (
    <MobileBotCardFrame
      avatar={<Monitor size={14} color={colors.textMuted} />}
      title={title}
      meta={
        <MobileBotCardMeta fontScale={fontScale}>
          {t('chat.botCards.screen.desktopOnly', 'Open in desktop Orca')}
        </MobileBotCardMeta>
      }
      fontScale={fontScale}
      testID="bot-screen-card"
    >
      {directive.reason ? (
        <Text style={[styles.reason, scaledType(typography.bodySize, fontScale)]}>
          {directive.reason}
        </Text>
      ) : null}
    </MobileBotCardFrame>
  )
}

const styles = themedStyleSheet(() => ({
  reason: { color: colors.textSecondary }
}))
