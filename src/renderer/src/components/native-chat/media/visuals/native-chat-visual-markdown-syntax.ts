// Parse assistant visual directives as markdown blocks so fences, quotes and lists retain their grammar.

import type { Node, Paragraph, Root, RootContent } from 'mdast'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type {
  Code,
  Construct,
  Effects,
  Extension as MicromarkExtension,
  State,
  TokenizeContext
} from 'micromark-util-types'
import type { Processor, PluggableList } from 'unified'
import {
  NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH,
  NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE,
  parseNativeChatVisualDirectiveLine,
  type NativeChatScreenDirective
} from '../../../../../../shared/native-chat/visuals/native-chat-visual-directive'
import { nativeChatBotDirectiveCardOf } from '../../../../../../shared/native-chat/bot-cards/native-chat-bot-card-kind'

const TOKEN_TYPE = 'nativeChatVisual'
const COLON = 58
const HORIZONTAL_TAB = -2
const VIRTUAL_SPACE = -1

// Hast properties the placeholder carries through sanitize to the React component.
const NONCE_PROPERTY = 'dataOrcaVisual'
const FILE_PROPERTY = 'dataOrcaVisualFile'
const TITLE_PROPERTY = 'dataOrcaVisualTitle'
const HOOK_PROPERTY = 'dataOrcaVisualHook'
const SCREEN_PROPERTY = 'dataOrcaScreen'
const SCREEN_URL_PROPERTY = 'dataOrcaScreenUrl'
const SCREEN_SANDBOX_PROPERTY = 'dataOrcaScreenSandbox'
const SCREEN_TITLE_PROPERTY = 'dataOrcaScreenTitle'
const SCREEN_REASON_PROPERTY = 'dataOrcaScreenReason'
export const NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES = [
  NONCE_PROPERTY,
  FILE_PROPERTY,
  TITLE_PROPERTY,
  HOOK_PROPERTY,
  SCREEN_PROPERTY,
  SCREEN_URL_PROPERTY,
  SCREEN_SANDBOX_PROPERTY,
  SCREEN_TITLE_PROPERTY,
  SCREEN_REASON_PROPERTY
] as const

type ParsedDirective =
  | { kind: 'visual'; file: string; title: string | null }
  | { kind: 'webhook'; hookId: string }
  | { kind: 'screen'; screen: NativeChatScreenDirective }

function parseDirectiveLine(line: string): ParsedDirective | null {
  const visual = parseNativeChatVisualDirectiveLine(line)
  if (visual) {
    return { kind: 'visual', ...visual }
  }
  const card = nativeChatBotDirectiveCardOf(line)
  if (!card) {
    return null
  }
  switch (card.kind) {
    case 'webhook':
      return { kind: 'webhook', hookId: card.value.hookId }
    case 'screen':
      return { kind: 'screen', screen: card.value }
  }
}

export type NativeChatVisualNode = Node & {
  type: 'nativeChatVisual'
  file: string
  title: string | null
  /** Set for a webhook card line, whose file and title stay empty. */
  hookId: string | null
  /** Set for a local PC screen handoff card line. */
  screen: NativeChatScreenDirective | null
  /** The line as written, for a directive shown as text instead. */
  source: string
  data?: { hName?: string; hProperties?: Record<string, string> }
}

declare module 'mdast' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface.
  interface RootContentMap {
    nativeChatVisual: NativeChatVisualNode
  }
}

declare module 'micromark-util-types' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface.
  interface TokenTypeMap {
    nativeChatVisual: 'nativeChatVisual'
  }
}

function tokenizeVisualLine(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  let line = ''
  const inside: State = (code: Code) => {
    // EOF, or a line ending (the negative codes below the tab/virtual-space codes).
    if (code === null || code < HORIZONTAL_TAB) {
      effects.exit(TOKEN_TYPE)
      return parseDirectiveLine(line) ? ok(code) : nok(code)
    }
    if (line.length >= NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH) {
      return nok(code)
    }
    if (code !== VIRTUAL_SPACE) {
      line += code === HORIZONTAL_TAB ? '\t' : String.fromCharCode(code)
    }
    effects.consume(code)
    return inside
  }
  return (code) => {
    effects.enter(TOKEN_TYPE)
    return inside(code)
  }
}

const visualLineConstruct: Construct = { name: TOKEN_TYPE, tokenize: tokenizeVisualLine }

const visualMicromarkExtension: MicromarkExtension = { flow: { [COLON]: visualLineConstruct } }

const visualFromMarkdown: FromMarkdownExtension = {
  enter: {
    [TOKEN_TYPE](token) {
      this.enter(
        {
          type: 'nativeChatVisual',
          file: '',
          title: null,
          hookId: null,
          screen: null,
          source: ''
        },
        token
      )
    }
  },
  exit: {
    [TOKEN_TYPE](token) {
      const node = this.stack.at(-1)
      const source = this.sliceSerialize(token)
      const directive = parseDirectiveLine(source)
      if (node?.type === 'nativeChatVisual' && directive) {
        if (directive.kind === 'visual') {
          node.file = directive.file
          node.title = directive.title
        } else if (directive.kind === 'webhook') {
          node.hookId = directive.hookId
        } else {
          node.screen = directive.screen
        }
        node.source = source
      }
      this.exit(token)
    }
  }
}

function literalParagraph(node: NativeChatVisualNode): Paragraph {
  return { type: 'paragraph', children: [{ type: 'text', value: node.source }] }
}

type ChildList = { children: RootContent[] }

function hasChildren(node: RootContent): node is RootContent & ChildList {
  return 'children' in node && Array.isArray(node.children)
}

/** Mount only standalone top-level directives within the per-message cap; render nested/excess directives as authored text. */
function placeVisuals(
  parent: ChildList,
  isRoot: boolean,
  nonce: string,
  mounted: { count: number }
): void {
  parent.children = parent.children.map((child) => {
    if (child.type === 'nativeChatVisual') {
      if (!isRoot || mounted.count >= NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE) {
        return literalParagraph(child)
      }
      mounted.count += 1
      const hProperties: Record<string, string> = { [NONCE_PROPERTY]: nonce }
      if (child.hookId) {
        hProperties[HOOK_PROPERTY] = child.hookId
      } else if (child.screen) {
        hProperties[SCREEN_PROPERTY] = '1'
        if (child.screen.url) {
          hProperties[SCREEN_URL_PROPERTY] = child.screen.url
        }
        if (child.screen.sandbox) {
          hProperties[SCREEN_SANDBOX_PROPERTY] = child.screen.sandbox
        }
        if (child.screen.title) {
          hProperties[SCREEN_TITLE_PROPERTY] = child.screen.title
        }
        if (child.screen.reason) {
          hProperties[SCREEN_REASON_PROPERTY] = child.screen.reason
        }
      } else {
        hProperties[FILE_PROPERTY] = child.file
        if (child.title) {
          hProperties[TITLE_PROPERTY] = child.title
        }
      }
      child.data = { hName: 'div', hProperties }
      return child
    }
    if (hasChildren(child)) {
      placeVisuals(child, false, nonce, mounted)
    }
    return child
  })
}

/** Use an unguessable per-message nonce so reply HTML cannot forge mountable placeholders. */
export function remarkNativeChatVisuals(this: Processor, nonce: string): (tree: Root) => void {
  const data = this.data()
  data.micromarkExtensions = [...(data.micromarkExtensions ?? []), visualMicromarkExtension]
  data.fromMarkdownExtensions = [...(data.fromMarkdownExtensions ?? []), visualFromMarkdown]
  return (tree) => placeVisuals(tree, true, nonce, { count: 0 })
}

export function nativeChatVisualRemarkPlugins(nonce: string): PluggableList {
  return [[remarkNativeChatVisuals, nonce]]
}
