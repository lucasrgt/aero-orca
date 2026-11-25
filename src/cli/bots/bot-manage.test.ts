import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime/client'
import { BOT_MANAGE_HANDLERS } from './bot-manage'

afterEach(() => {
  vi.restoreAllMocks()
})

const BOT = {
  id: 'bot-1',
  name: 'Sentinel',
  agent: 'claude',
  paused: false,
  folder: 'sentinel',
  folderWorkspaceId: 'fw-1',
  members: [],
  createdAt: 1,
  updatedAt: 1
}

function makeClient(extraResult?: (method: string) => unknown) {
  const calls: { method: string; params: unknown }[] = []
  const call = vi.fn(async (method: string, params?: unknown) => {
    calls.push({ method, params })
    if (method === 'bots.list') {
      return {
        id: 'r',
        ok: true as const,
        result: { bots: [BOT], threadReplies: false },
        _meta: { runtimeId: 'rt' }
      }
    }
    const result = extraResult ? extraResult(method) : { bot: BOT }
    return { id: 'r', ok: true as const, result, _meta: { runtimeId: 'rt' } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: handlers read only client.call.
  return { calls, client: { call } as unknown as RuntimeClient }
}

describe('orca bot manage commands', () => {
  it('shows a bot profile and its tools', async () => {
    const { calls, client } = makeClient((method) => {
      if (method === 'bots.show') {
        return {
          bot: BOT,
          homeFolder: '/home/u/.orca/bots/sentinel',
          soul: '# Sentinel',
          memory: ''
        }
      }
      if (method === 'bots.tools.list') {
        return { agent: 'claude', own: [], inherited: [], problems: {} }
      }
      return {}
    })
    await BOT_MANAGE_HANDLERS['bot show']!({
      flags: new Map([['bot', 'Sentinel']]),
      client,
      cwd: '/',
      json: false
    })
    expect(calls.map((c) => c.method)).toEqual(['bots.list', 'bots.show', 'bots.tools.list'])
  })

  it('updates a bot model, pause state and SOUL.md', async () => {
    const { calls, client } = makeClient(() => ({
      bot: { ...BOT, paused: true, launch: { model: 'claude-sonnet-4-6' } }
    }))
    await BOT_MANAGE_HANDLERS['bot update']!({
      flags: new Map<string, string | boolean>([
        ['bot', 'Sentinel'],
        ['model', 'claude-sonnet-4-6'],
        ['pause', true],
        ['soul', '# Sentinel\nWatches builds.']
      ]),
      client,
      cwd: '/',
      json: false
    })
    expect(calls[1]).toEqual({
      method: 'bots.update',
      params: {
        botId: 'bot-1',
        updates: {
          launch: { model: 'claude-sonnet-4-6' },
          paused: true,
          soul: '# Sentinel\nWatches builds.'
        }
      }
    })
  })

  it('refuses delete without --yes and deletes with --yes', async () => {
    const { calls, client } = makeClient(() => ({ deleted: true }))
    await expect(
      BOT_MANAGE_HANDLERS['bot delete']!({
        flags: new Map([['bot', 'Sentinel']]),
        client,
        cwd: '/',
        json: false
      })
    ).rejects.toThrow('--yes')
    expect(calls).toEqual([])

    await BOT_MANAGE_HANDLERS['bot delete']!({
      flags: new Map<string, string | boolean>([
        ['bot', 'Sentinel'],
        ['yes', true],
        ['delete-folder', true]
      ]),
      client,
      cwd: '/',
      json: false
    })
    expect(calls[1]).toEqual({
      method: 'bots.delete',
      params: { botId: 'bot-1', deleteFolder: true }
    })
  })

  it('lists available bot agents and sends messages to a bot', async () => {
    const { calls, client } = makeClient((method) =>
      method === 'bots.agentChoices'
        ? { agents: ['claude', 'codex', 'antigravity'] }
        : { botId: 'bot-1', sessionId: 'sess-1', outcome: { status: 'queued' } }
    )
    await BOT_MANAGE_HANDLERS['bot agents']!({
      flags: new Map(),
      client,
      cwd: '/',
      json: false
    })
    await BOT_MANAGE_HANDLERS['bot send']!({
      flags: new Map([
        ['bot', 'Sentinel'],
        ['message', 'Check CI status']
      ]),
      client,
      cwd: '/',
      json: false
    })
    expect(calls[0]).toEqual({ method: 'bots.agentChoices', params: undefined })
    expect(calls[2]).toEqual({
      method: 'bots.send',
      params: { botId: 'bot-1', message: 'Check CI status' }
    })
  })
})
