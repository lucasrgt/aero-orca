import { describe, expect, it } from 'vitest'
import {
  formatNativeChatScreenDirective,
  isLocalScreenUrl,
  isPendingNativeChatVisualDirectiveTail,
  parseNativeChatScreenDirectiveLine,
  withoutNativeChatVisualDirectiveLines
} from './native-chat-visual-directive'

describe('native-chat screen directive', () => {
  it('accepts only loopback http(s) URLs with an explicit port', () => {
    expect(
      isLocalScreenUrl(
        'http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale&bell=off&path=websockify%3Ftoken%3Dmain'
      )
    ).toBe(true)
    expect(isLocalScreenUrl('http://localhost:6080/vnc.html')).toBe(true)
    expect(isLocalScreenUrl('http://[::1]:6080/vnc.html')).toBe(true)
    expect(isLocalScreenUrl('http://127.0.0.1/vnc.html')).toBe(false)
    expect(isLocalScreenUrl('https://evil.example.com:6080/vnc.html')).toBe(false)
    expect(isLocalScreenUrl('javascript:alert(1)')).toBe(false)
    expect(isLocalScreenUrl('http://user:pass@127.0.0.1:6080/vnc.html')).toBe(false)
  })

  it('parses valid ::orca-screen directives and rejects non-loopback URLs', () => {
    const parsed = parseNativeChatScreenDirectiveLine(
      '::orca-screen{url="http://127.0.0.1:6080/vnc.html?autoconnect=1" sandbox="pczinho" title="pczinho" reason="Sign in to Cloudflare"}'
    )
    expect(parsed).toEqual({
      url: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
      sandbox: 'pczinho',
      title: 'pczinho',
      reason: 'Sign in to Cloudflare'
    })

    expect(parseNativeChatScreenDirectiveLine('::orca-screen{reason="Approve login"}')).toEqual({
      url: null,
      sandbox: null,
      title: null,
      reason: 'Approve login'
    })

    expect(
      parseNativeChatScreenDirectiveLine('::orca-screen{url="https://example.com:443/vnc.html"}')
    ).toBeNull()
  })

  it('formats and round-trips screen directives safely', () => {
    const line = formatNativeChatScreenDirective({
      url: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
      sandbox: 'pczinho',
      title: 'pczinho "desktop"',
      reason: 'Log in\nto Cloudflare'
    })
    expect(parseNativeChatScreenDirectiveLine(line)).toEqual({
      url: 'http://127.0.0.1:6080/vnc.html?autoconnect=1',
      sandbox: 'pczinho',
      title: 'pczinho desktop',
      reason: 'Log in to Cloudflare'
    })
  })

  it('suppresses streaming tails and strips screen directives from plain text', () => {
    expect(isPendingNativeChatVisualDirectiveTail('::orca-screen{url="http://127.0.0.1:6080')).toBe(
      true
    )
    const stripped = withoutNativeChatVisualDirectiveLines(
      'Log in on the screen below:\n\n::orca-screen{url="http://127.0.0.1:6080/vnc.html" title="pczinho"}\n\nLet me know when ready.'
    )
    expect(stripped).toBe('Log in on the screen below:\n\nLet me know when ready.')
  })
})
