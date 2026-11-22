import { describe, expect, it } from 'vitest'
import {
  buildDockerNovncScreenUrl,
  parseDockerPsNovncRows,
  parseNovncTokenList,
  pickMatchingLocalScreen
} from './local-screen-discovery-utils'
import type { LocalScreenEntry } from './local-sandbox-types'

describe('local screen discovery utils', () => {
  it('parses docker ps rows exposing noVNC port 6080 and skips excluded containers', () => {
    const stdout = [
      'doxide-d2-pg\t127.0.0.1:55432->5432/tcp',
      'pczinho\t127.0.0.1:6080->6080/tcp, 127.0.0.1:5959->5901/tcp',
      'orca-sandbox-work-a1b2c3\t127.0.0.1:41234->6080/tcp'
    ].join('\n')

    expect(parseDockerPsNovncRows(stdout, new Set(['orca-sandbox-work-a1b2c3']))).toEqual([
      { containerName: 'pczinho', novncPort: 6080 }
    ])
  })

  it('builds token-routed and direct noVNC screen URLs', () => {
    expect(buildDockerNovncScreenUrl(6080, 'main')).toBe(
      'http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale&bell=off&path=websockify%3Ftoken%3Dmain'
    )
    expect(buildDockerNovncScreenUrl(41234, null)).toBe(
      'http://127.0.0.1:41234/vnc.html?autoconnect=1&resize=scale&bell=off'
    )
  })

  it('parses websockify token directory listings and token files', () => {
    expect(parseNovncTokenList('desk2\nmain\n')).toBe('main')
    expect(parseNovncTokenList('main: localhost:5901\n')).toBe('main')
    expect(parseNovncTokenList('custom: localhost:5902\n')).toBe('custom')
    expect(parseNovncTokenList('# comment\n')).toBeNull()
  })

  it('picks matching screen by selector, environment, or running preference', () => {
    const screens: LocalScreenEntry[] = [
      {
        id: 'sandbox-a',
        name: 'Work Sandbox',
        kind: 'sandbox',
        containerName: 'orca-sandbox-work',
        status: 'running',
        screenUrl: 'http://127.0.0.1:41234/vnc.html?autoconnect=1&resize=scale&bell=off',
        environmentId: 'env-1'
      },
      {
        id: 'docker:pczinho',
        name: 'pczinho',
        kind: 'docker',
        containerName: 'pczinho',
        status: 'running',
        screenUrl:
          'http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale&bell=off&path=websockify%3Ftoken%3Dmain'
      }
    ]

    expect(pickMatchingLocalScreen(screens, { selector: 'pczinho' })?.id).toBe('docker:pczinho')
    expect(pickMatchingLocalScreen(screens, { environmentId: 'env-1' })?.id).toBe('sandbox-a')
    expect(pickMatchingLocalScreen(screens)?.id).toBe('sandbox-a')
    expect(pickMatchingLocalScreen(screens, { selector: 'missing' })).toBeNull()
  })
})
