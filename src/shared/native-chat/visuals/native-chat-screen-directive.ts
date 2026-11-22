// ::orca-screen{url="http://127.0.0.1:…" sandbox="…" title="…" reason="…"}: inline PC screen handoff card.

export const NATIVE_CHAT_SCREEN_DIRECTIVE_MARKER = '::orca-screen{'
export const NATIVE_CHAT_SCREEN_URL_MAX_LENGTH = 300
export const NATIVE_CHAT_SCREEN_SANDBOX_MAX_LENGTH = 80
export const NATIVE_CHAT_SCREEN_REASON_MAX_LENGTH = 240
const SCREEN_TITLE_MAX_LENGTH = 120
const SCREEN_SANDBOX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export type NativeChatScreenDirective = {
  url: string | null
  sandbox: string | null
  title: string | null
  reason: string | null
}

function isPlainValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f || code === 0x5c) {
      return false
    }
  }
  return true
}

/** Only loopback HTTP(S) URLs with an explicit port can be embedded or opened as a local PC screen. */
export function isLocalScreenUrl(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > NATIVE_CHAT_SCREEN_URL_MAX_LENGTH ||
    !isPlainValue(value)
  ) {
    return false
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname) || !parsed.port || parsed.username || parsed.password) {
    return false
  }
  const port = Number(parsed.port)
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

/** Validate parsed directive attributes for a `::orca-screen{...}` line. */
export function buildNativeChatScreenDirective(
  attributes: Map<string, string> | null
): NativeChatScreenDirective | null {
  if (!attributes) {
    return null
  }
  const rawUrl = attributes.get('url')?.trim() ?? ''
  if (rawUrl.length > 0 && !isLocalScreenUrl(rawUrl)) {
    return null
  }
  const rawSandbox = attributes.get('sandbox')?.trim() ?? ''
  if (
    rawSandbox.length > 0 &&
    (rawSandbox.length > NATIVE_CHAT_SCREEN_SANDBOX_MAX_LENGTH ||
      !SCREEN_SANDBOX_PATTERN.test(rawSandbox))
  ) {
    return null
  }
  const title = attributes.get('title')?.trim() ?? ''
  if (title.length > SCREEN_TITLE_MAX_LENGTH) {
    return null
  }
  const reason = attributes.get('reason')?.trim() ?? ''
  if (reason.length > NATIVE_CHAT_SCREEN_REASON_MAX_LENGTH) {
    return null
  }
  return {
    url: rawUrl.length > 0 ? rawUrl : null,
    sandbox: rawSandbox.length > 0 ? rawSandbox : null,
    title: title.length > 0 ? title : null,
    reason: reason.length > 0 ? reason : null
  }
}

function sanitizeDirectiveAttr(value: string, maxLength: number): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["\\]/g, '')
    .trim()
    .slice(0, maxLength)
}

/** Format a valid `::orca-screen{...}` directive line from structured fields. */
export function formatNativeChatScreenDirective(
  directive: Partial<NativeChatScreenDirective>
): string {
  const parts: string[] = []
  const url = directive.url?.trim() ?? ''
  if (url && isLocalScreenUrl(url)) {
    parts.push(`url="${url}"`)
  }
  const sandbox = directive.sandbox?.trim() ?? ''
  if (sandbox && SCREEN_SANDBOX_PATTERN.test(sandbox)) {
    parts.push(`sandbox="${sandbox}"`)
  }
  const title = directive.title
    ? sanitizeDirectiveAttr(directive.title, SCREEN_TITLE_MAX_LENGTH)
    : ''
  if (title) {
    parts.push(`title="${title}"`)
  }
  const reason = directive.reason
    ? sanitizeDirectiveAttr(directive.reason, NATIVE_CHAT_SCREEN_REASON_MAX_LENGTH)
    : ''
  if (reason) {
    parts.push(`reason="${reason}"`)
  }
  return `${NATIVE_CHAT_SCREEN_DIRECTIVE_MARKER}${parts.join(' ')}}`
}
