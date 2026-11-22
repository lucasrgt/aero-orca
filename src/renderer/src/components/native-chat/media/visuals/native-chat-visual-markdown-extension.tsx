import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import type { ExtraProps } from 'react-markdown'
import type { CommentMarkdownExtension } from '@/components/comment-markdown/CommentMarkdown'
import {
  NATIVE_CHAT_SCREEN_DIRECTIVE_MARKER,
  NATIVE_CHAT_SCREEN_REASON_MAX_LENGTH,
  NATIVE_CHAT_SCREEN_SANDBOX_MAX_LENGTH,
  NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH,
  NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER,
  NATIVE_CHAT_WEBHOOK_DIRECTIVE_MARKER,
  isLocalScreenUrl,
  isNativeChatVisualFileName
} from '../../../../../../shared/native-chat/visuals/native-chat-visual-directive'
import { WEBHOOK_HOOK_ID_PATTERN } from '../../../../../../shared/connector-webhook-contract'
import { NativeChatInlineVisual } from './NativeChatInlineVisual'
import { NativeChatScreenCard } from '../../NativeChatScreenCard'
import { NativeChatWebhookCard } from '../../NativeChatWebhookCard'
import type { NativeChatVisualOwner } from './native-chat-visual-owner'
import { useNativeChatVisualOwner } from './native-chat-visual-owner'
import {
  NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES,
  nativeChatVisualRemarkPlugins
} from './native-chat-visual-markdown-syntax'

type DivProps = ComponentPropsWithoutRef<'div'> & ExtraProps

function placeholderAttributes(props: DivProps): {
  nonce: unknown
  file: unknown
  title: unknown
  hook: unknown
  screen: unknown
  screenUrl: unknown
  screenSandbox: unknown
  screenTitle: unknown
  screenReason: unknown
} {
  return {
    nonce: 'data-orca-visual' in props ? props['data-orca-visual'] : undefined,
    file: 'data-orca-visual-file' in props ? props['data-orca-visual-file'] : undefined,
    title: 'data-orca-visual-title' in props ? props['data-orca-visual-title'] : undefined,
    hook: 'data-orca-visual-hook' in props ? props['data-orca-visual-hook'] : undefined,
    screen: 'data-orca-screen' in props ? props['data-orca-screen'] : undefined,
    screenUrl: 'data-orca-screen-url' in props ? props['data-orca-screen-url'] : undefined,
    screenSandbox:
      'data-orca-screen-sandbox' in props ? props['data-orca-screen-sandbox'] : undefined,
    screenTitle: 'data-orca-screen-title' in props ? props['data-orca-screen-title'] : undefined,
    screenReason: 'data-orca-screen-reason' in props ? props['data-orca-screen-reason'] : undefined
  }
}

function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createVisualExtension(
  owner: NativeChatVisualOwner,
  nonce: string
): CommentMarkdownExtension {
  function VisualPlaceholder({ node: _node, ...props }: DivProps): React.JSX.Element {
    const {
      nonce: placeholderNonce,
      file,
      title,
      hook,
      screen,
      screenUrl,
      screenSandbox,
      screenTitle,
      screenReason
    } = placeholderAttributes(props)
    // Only the parser's own placeholders carry this message's nonce; the fields are re-checked anyway.
    if (
      placeholderNonce === nonce &&
      typeof hook === 'string' &&
      WEBHOOK_HOOK_ID_PATTERN.test(hook)
    ) {
      return <NativeChatWebhookCard owner={owner} hookId={hook} />
    }
    if (placeholderNonce === nonce && screen === '1') {
      const validUrl =
        typeof screenUrl === 'string' && isLocalScreenUrl(screenUrl) ? screenUrl : null
      const validSandbox =
        typeof screenSandbox === 'string' &&
        screenSandbox.length > 0 &&
        screenSandbox.length <= NATIVE_CHAT_SCREEN_SANDBOX_MAX_LENGTH
          ? screenSandbox
          : null
      const validTitle =
        typeof screenTitle === 'string' &&
        screenTitle.length > 0 &&
        screenTitle.length <= NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH
          ? screenTitle
          : null
      const validReason =
        typeof screenReason === 'string' &&
        screenReason.length > 0 &&
        screenReason.length <= NATIVE_CHAT_SCREEN_REASON_MAX_LENGTH
          ? screenReason
          : null
      return (
        <NativeChatScreenCard
          owner={owner}
          directive={{
            url: validUrl,
            sandbox: validSandbox,
            title: validTitle,
            reason: validReason
          }}
        />
      )
    }
    if (
      placeholderNonce !== nonce ||
      typeof file !== 'string' ||
      !isNativeChatVisualFileName(file) ||
      (title !== undefined &&
        (typeof title !== 'string' || title.length > NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH))
    ) {
      return <div {...props} />
    }
    return (
      <NativeChatInlineVisual
        owner={owner}
        file={file}
        title={typeof title === 'string' && title.length > 0 ? title : null}
      />
    )
  }
  return {
    remarkPlugins: nativeChatVisualRemarkPlugins(nonce),
    extraFlowSyntaxMarkers: [
      NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER,
      NATIVE_CHAT_WEBHOOK_DIRECTIVE_MARKER,
      NATIVE_CHAT_SCREEN_DIRECTIVE_MARKER
    ],
    sanitizeAttributes: { div: [...NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES] },
    components: { div: VisualPlaceholder }
  }
}

/** Keep the structured message’s extension stable so streaming preserves its mounted visual frame. */
export function useNativeChatVisualMarkdownExtension(
  messageId: string | undefined
): CommentMarkdownExtension | undefined {
  const owner = useNativeChatVisualOwner()
  const [nonce] = useState(newNonce)
  return useMemo(
    () => (owner && messageId ? createVisualExtension(owner, nonce) : undefined),
    [messageId, nonce, owner]
  )
}
