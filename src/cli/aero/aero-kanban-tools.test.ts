import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAeroNyaGit } from './aero-nya-git'
import { createAeroKanbanTools, type AeroKanbanTools } from './aero-kanban-tools'

type Board = {
  card: {
    id: string
    column: string
    blocked_by: string[]
    blocks: string[]
    outcome?: Record<string, unknown>
    clarifications?: { id: string; answer: string; via: string }[]
  }[]
  board_path: string
  unblocked?: { card: string; ready: boolean; waiting_on: string[] }[]
}

const roots: string[] = []

async function makeRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  roots.push(root)
  return root
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

async function call(
  tools: AeroKanbanTools,
  name: string,
  args: Record<string, unknown>
): Promise<Board> {
  const board: Board = JSON.parse(await tools.call(name, args))
  return board
}

describe('the checkout a board lives in', () => {
  let primary: string
  let linked: string

  beforeEach(async () => {
    primary = await makeRoot('aero-kanban-primary-')
    await runAeroNyaGit(primary, ['init', '-q'])
    await runAeroNyaGit(primary, ['config', 'user.email', 'dev@example.com'])
    await runAeroNyaGit(primary, ['config', 'user.name', 'Dev Example'])
    await runAeroNyaGit(primary, ['config', 'commit.gpgsign', 'false'])
    await mkdir(join(primary, '.aerofortress'), { recursive: true })
    await writeFile(join(primary, '.aerofortress', 'README.md'), 'notes\n')
    await runAeroNyaGit(primary, ['add', '-A'])
    await runAeroNyaGit(primary, ['commit', '-q', '-m', 'initial'])
    linked = join(await makeRoot('aero-kanban-linked-'), 'wt')
    await runAeroNyaGit(primary, ['worktree', 'add', '-q', '-b', 'feature', linked])
  })

  it('is the primary checkout when the tools run inside a linked worktree', async () => {
    const tools = createAeroKanbanTools(linked)

    const board = await call(tools, 'kanban_card_add', { board: 'work', title: 'shared card' })

    expect(board.board_path).toBe(join(primary, '.aerofortress', 'kanban', 'work.toml'))
    expect(await readFile(board.board_path, 'utf8')).toContain('shared card')
    await expect(readFile(join(linked, '.aerofortress', 'kanban', 'work.toml'))).rejects.toThrow()
    const fromPrimary = await call(createAeroKanbanTools(primary), 'kanban_board', {
      board: 'work'
    })
    expect(fromPrimary.card).toHaveLength(1)
  })

  it('stays the worktree itself while the primary checkout has no .aerofortress', async () => {
    await runAeroNyaGit(primary, ['rm', '-rq', '.aerofortress'])
    await rm(join(primary, '.aerofortress'), { recursive: true, force: true })
    await mkdir(join(linked, '.aerofortress'), { recursive: true })

    const board = await call(createAeroKanbanTools(linked), 'kanban_card_add', {
      board: 'work',
      title: 'local card'
    })

    expect(board.board_path).toBe(join(linked, '.aerofortress', 'kanban', 'work.toml'))
  })
})

describe('what an agent may write into a card', () => {
  async function boardWithHarnessRecord(): Promise<{ tools: AeroKanbanTools; card: string }> {
    const root = await makeRoot('aero-kanban-outcome-')
    await mkdir(join(root, '.aerofortress'), { recursive: true })
    const tools = createAeroKanbanTools(root)
    const added = await call(tools, 'kanban_card_add', { board: 'work', title: 'delivered' })
    const card = added.card[0].id
    // the runner records its own proof in the outcome; the tools never write these fields
    const path = added.board_path
    const text = await readFile(path, 'utf8')
    await writeFile(
      path,
      `${text}\n[card.outcome]\nstatus = "done"\nsummary = ""\npr = ""\nbranch = ""\nevidence = []\nfollowups = []\nquestions = []\nat = "t"\nfully_proven = true\nverified_sha = "abc123"\n\n[card.outcome.criteria]\npass = 1\nfail = 0\n`
    )
    return { tools, card }
  }

  it('never includes the verified commit, the proof or the merge state', async () => {
    const { tools, card } = await boardWithHarnessRecord()

    await expect(
      tools.call('kanban_card_update', {
        board: 'work',
        card,
        outcome: { status: 'done', verified_sha: 'forged', fully_proven: true }
      })
    ).rejects.toThrow(/outcome\.verified_sha is written by the harness only/)
    await expect(
      tools.call('kanban_card_update', { board: 'work', card, outcome: null })
    ).rejects.toThrow(/cannot be cleared from here/)
    await expect(
      tools.call('kanban_card_update', { board: 'work', card, readiness: { verdict: 'ready' } })
    ).rejects.toThrow(/readiness is set by kanban_card_triage/)

    const kept = await call(tools, 'kanban_card_update', {
      board: 'work',
      card,
      outcome: {
        status: 'reviewed',
        summary: 'looks right',
        verified_sha: 'abc123',
        fully_proven: true
      }
    })
    expect(kept.card[0].outcome).toMatchObject({
      status: 'reviewed',
      verified_sha: 'abc123',
      fully_proven: true
    })
  })
})

describe('a board checked out with CRLF line endings', () => {
  it('reads like the LF board, stays untouched until edited, and is written back as LF', async () => {
    const root = await makeRoot('aero-kanban-crlf-')
    const kanban = join(root, '.aerofortress', 'kanban')
    await mkdir(kanban, { recursive: true })
    const lf = await readFile(
      resolve('src/shared/aero/__fixtures__/kanban-real-autopilot-trimmed.toml'),
      'utf8'
    )
    const crlf = lf.replaceAll('\n', '\r\n')
    await writeFile(join(kanban, 'lf.toml'), lf)
    await writeFile(join(kanban, 'crlf.toml'), crlf)
    const tools = createAeroKanbanTools(root, { now: () => new Date('2026-11-26T12:00:00Z') })
    const view = async (board: string): Promise<Board> => ({
      ...(await call(tools, 'kanban_board', { board })),
      board_path: ''
    })

    // the same tree, so the same card text hashes and readiness staleness
    expect(await view('crlf')).toEqual(await view('lf'))
    await call(tools, 'kanban_board_create', { board: 'crlf' })
    expect(await readFile(join(kanban, 'crlf.toml'), 'utf8')).toBe(crlf)

    const card = (await view('lf')).card[0].id
    for (const board of ['lf', 'crlf']) {
      await call(tools, 'kanban_card_update', { board, card, priority: 'urgent' })
    }
    const written = await readFile(join(kanban, 'crlf.toml'), 'utf8')
    expect(written.includes('\r')).toBe(false)
    expect(written).toBe(await readFile(join(kanban, 'lf.toml'), 'utf8'))
  })
})

describe('cards that depend on each other across boards', () => {
  it('reports what a card unblocks and leaves no dangling edge when it is removed', async () => {
    const root = await makeRoot('aero-kanban-links-')
    await mkdir(join(root, '.aerofortress'), { recursive: true })
    const tools = createAeroKanbanTools(root)
    const upstream = (await call(tools, 'kanban_card_add', { board: 'backend', title: 'api' }))
      .card[0]
    const downstream = (await call(tools, 'kanban_card_add', { board: 'frontend', title: 'ui' }))
      .card[0]

    const linked = await call(tools, 'kanban_card_link', {
      board: 'frontend',
      card: downstream.id,
      blocked_by: `backend/${upstream.id}`
    })
    expect(linked.card[0].blocked_by).toEqual([`backend/${upstream.id}`])
    const afterLink = await call(tools, 'kanban_board', { board: 'backend' })
    expect(afterLink.card[0].blocks).toEqual([`frontend/${downstream.id}`])

    const moved = await call(tools, 'kanban_card_move', {
      board: 'backend',
      card: upstream.id,
      column: 'done'
    })
    expect(moved.unblocked).toEqual([
      expect.objectContaining({ card: `frontend/${downstream.id}`, ready: true, waiting_on: [] })
    ])

    await call(tools, 'kanban_card_remove', { board: 'backend', card: upstream.id })
    const frontend = await call(tools, 'kanban_board', { board: 'frontend' })
    expect(frontend.card[0].blocked_by).toEqual([])
  })

  it('stores an agent answer as the English option, labelled as the agent', async () => {
    const root = await makeRoot('aero-kanban-answer-')
    await mkdir(join(root, '.aerofortress'), { recursive: true })
    const tools = createAeroKanbanTools(root)
    const added = await call(tools, 'kanban_card_add', { board: 'work', title: 'ask' })
    const text = await readFile(added.board_path, 'utf8')
    await writeFile(
      added.board_path,
      `${text}\n[[card.clarifications]]\nid = "q1"\nquestion = "Ship it?"\nanswer = ""\nasked_at = "t"\nanswered_at = ""\nvia = ""\noptions = ["Yes", "No"]\nrecommended = 0\n\n[card.clarifications.tr]\nlang = "pt-BR"\nquestion = "Publicar?"\noptions = ["Sim", "Nao"]\n`
    )

    const reply: { stored: number; via: string } = JSON.parse(
      await tools.call('kanban_card_answer', {
        board: 'work',
        card: added.card[0].id,
        answers: [{ id: 'q1', answer: 'sim' }]
      })
    )
    expect(reply).toMatchObject({ stored: 1, via: 'agent' })
    const board = await call(tools, 'kanban_board', { board: 'work' })
    expect(board.card[0].clarifications?.[0]).toMatchObject({ answer: 'Yes', via: 'agent' })
    await expect(
      tools.call('kanban_card_answer', {
        board: 'work',
        card: added.card[0].id,
        answers: [{ id: 'q1', answer: 'again' }]
      })
    ).rejects.toThrow(/none of those questions is open/)
  })
})
