import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../dispatch/dispatch'
import { AERO_HANDLERS } from './aero-inspect'

const inspect = AERO_HANDLERS['aero inspect']

function context(flags: Record<string, string | boolean>): HandlerContext {
  return {
    flags: new Map(Object.entries(flags)),
    cwd: process.cwd(),
    json: false,
    client: undefined as never
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('orca aero inspect', () => {
  it('rejects --environment and --pairing-code instead of silently ignoring them', async () => {
    await expect(inspect(context({ environment: 'prod' }))).rejects.toThrow(
      '`--environment` does not retarget orca aero inspect; it reads local files'
    )
    await expect(inspect(context({ 'pairing-code': 'abc' }))).rejects.toThrow(
      '`--pairing-code` does not retarget orca aero inspect'
    )
  })

  it('refuses a bridged shell, where --path would name the Orca host disk', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/dev/project')
    await expect(inspect(context({ path: '.' }))).rejects.toThrow(
      'this shell forwards orca to the Orca host'
    )
  })
})
