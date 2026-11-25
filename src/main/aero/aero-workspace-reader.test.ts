import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, type TestContext } from 'vitest'
import { summarizeAeroSnapshot } from '../../shared/aero/aero-workspace-snapshot'
import { AERO_MAX_FILE_BYTES } from './aero-workspace-files'
import { readAeroWorkspace } from './aero-workspace-reader'

const FIXTURES = join(import.meta.dirname, '..', '..', 'shared', 'aero', '__fixtures__')
const NOW = new Date('2026-11-25T22:00:00Z')

let repo: string
// A folder next to the repo that links must never lead into.
let outside: string

async function putIn(root: string, relativePath: string, text: string): Promise<void> {
  const file = join(root, relativePath)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, text)
}

function put(relativePath: string, text: string): Promise<void> {
  return putIn(repo, relativePath, text)
}

/** A symlink needs a privilege on some Windows setups (a directory junction does not): skip then. */
async function link(
  target: string,
  path: string,
  type: 'file' | 'junction',
  ctx: TestContext
): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  try {
    await symlink(target, path, type)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      ctx.skip()
    }
    throw error
  }
}

async function putFixture(relativePath: string, fixture: string): Promise<void> {
  await mkdir(join(repo, relativePath, '..'), { recursive: true })
  await copyFile(join(FIXTURES, fixture), join(repo, relativePath))
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'aero-reader-'))
  outside = await mkdtemp(join(tmpdir(), 'aero-outside-'))
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('readAeroWorkspace', () => {
  it('reports an empty snapshot for a repo that never used Aero', async () => {
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.hasAerofortressDir).toBe(false)
    // autopilot.rs NO_FILE_LEVEL: no file means the repo sets no ceiling, not that it forbids.
    expect(snapshot.autopilot).toMatchObject({
      fileExists: false,
      level: 'pr',
      declaredLevel: 'off'
    })
    expect(snapshot.issues).toEqual([])
    expect(summarizeAeroSnapshot(snapshot).counts.items).toBe(0)
  })

  it('reads every artifact kind and keeps going past a bad file', async () => {
    await putFixture('.aerofortress/items/arch/842038ca.md', 'item-seasonal-comma-tags.md')
    await putFixture(
      '.aerofortress/items/aerofortress-harness/arch/0a0a9080.md',
      'item-digest-with-replaces-link.md'
    )
    await put('.aerofortress/items/arch/broken.md', '# no frontmatter')
    await putFixture('.aerofortress/kanban/autopilot.toml', 'board-autopilot.toml')
    await put('.aerofortress/kanban/bad.toml', 'name = ')
    await put('.aerofortress/autopilot.toml', 'level = "merge"\nlevl = "deploy"\n')
    await putFixture('.aerofortress/routines/manutencao.md', 'routine-weekly.md')
    await put('.aerofortress/routines/odd.md', '---\nschedule: whenever\n---\nGo')
    await put('.aerofortress/loops/forge.md', '---\nmax: 9000\nstop: done\n---\nIterate')
    await put('.aerofortress/agents/designer.md', '---\nmodel: claude-opus-5-5\n---\nYou design.')
    await put('.aerofortress/specs/clockwork.md', '<!-- clockwork-spec -->\n# Clockwork\nText')
    await putFixture('.nya/scars/NYA-1.toml', 'nya-scar.toml')
    await put('.nya/config.toml', 'schema = 1\n[check]\ntimeout_seconds = 600\n')

    const snapshot = await readAeroWorkspace(repo, NOW)

    expect(Object.keys(snapshot.itemsByCell).sort()).toEqual(['aerofortress-harness/arch', 'arch'])
    expect(snapshot.digests.map((item) => item.id)).toEqual([
      '0a0a9080-924a-4511-b67b-1bf5160e010a'
    ])
    expect(snapshot.boards.map((board) => board.name)).toEqual(['autopilot'])
    expect(snapshot.autopilot.level).toBe('off')
    expect(snapshot.autopilot.fileExists).toBe(true)
    expect(snapshot.routines.map((routine) => routine.name)).toEqual(['manutencao', 'odd'])
    expect(snapshot.loops[0]).toMatchObject({ name: 'forge', max: 500, stop: 'done' })
    expect(snapshot.agents[0]).toMatchObject({ name: 'designer', persona: 'You design.' })
    expect(snapshot.specs[0]).toMatchObject({
      path: '.aerofortress/specs/clockwork.md',
      title: 'Clockwork',
      clockwork: true
    })
    expect(snapshot.nya.scars.map((scar) => scar.id)).toEqual(['NYA-01KYASTB1H12GS04SVR3CNF2M9'])
    expect(snapshot.nya.config).toEqual({
      path: '.nya/config.toml',
      schema: 1,
      timeoutSeconds: 600
    })
    expect(snapshot.issues).toEqual([
      {
        path: '.aerofortress/items/arch/broken.md',
        reason: 'missing "---" frontmatter block'
      },
      { path: '.aerofortress/kanban/bad.toml', reason: expect.stringContaining('invalid TOML') },
      {
        path: '.aerofortress/routines/odd.md',
        reason: expect.stringContaining('routine "odd": unsupported schedule "whenever"')
      },
      {
        path: '.aerofortress/autopilot.toml',
        reason: expect.stringContaining('autopilot.toml does not parse')
      }
    ])
  })
  it('mirrors the retirement of items: a replaced digest stays listed, flagged replaced', async () => {
    const item = (id: string, tag: string, links = ''): string =>
      `---\nid: ${id}\ntitle: T ${id}\ntags: ${tag}\nlinks: ${links}\n---\nBody`
    await put('.aerofortress/items/a/new.md', item('new', 'digesto', 'replaces:old'))
    await put('.aerofortress/items/a/old.md', item('old', 'digesto'))
    await put('.aerofortress/items/a/rules.md', item('rules', 'constituicao'))
    await put('.aerofortress/items/a/oldrules.md', item('oldrules', 'constituicao'))
    await put(
      '.aerofortress/items/a/newrules.md',
      item('newrules', 'constituicao', 'replaces:oldrules')
    )
    const snapshot = await readAeroWorkspace(repo, NOW)
    const flags = (entries: { id: string; replaced: boolean }[]): [string, boolean][] =>
      entries.map((entry): [string, boolean] => [entry.id, entry.replaced]).sort()
    expect(flags(snapshot.digests)).toEqual([
      ['new', false],
      ['old', true]
    ])
    expect(flags(snapshot.constitution)).toEqual([
      ['newrules', false],
      ['oldrules', true],
      ['rules', false]
    ])
    const { counts } = summarizeAeroSnapshot(snapshot)
    expect(counts).toMatchObject({ items: 5, digests: 2, constitution: 3, replacedItems: 2 })
  })

  it('reports an oversized file and never reads it', async () => {
    const huge = 'x'.repeat(AERO_MAX_FILE_BYTES)
    await put('.aerofortress/autopilot.toml', `level = "pr"\n# ${huge}`)
    await put('.aerofortress/specs/huge.md', `${huge}x`)
    await put('.nya/config.toml', `schema = 1\n# ${huge}`)
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.autopilot).toMatchObject({ fileExists: true, level: 'off', valid: false })
    expect(snapshot.specs).toEqual([])
    expect(snapshot.nya.config).toBeNull()
    expect(snapshot.issues.map((issue) => issue.path).sort()).toEqual([
      '.aerofortress/autopilot.toml',
      '.aerofortress/specs/huge.md',
      '.nya/config.toml'
    ])
    expect(snapshot.issues.every((issue) => issue.reason.includes('larger than 4 MB'))).toBe(true)
  })

  it('skips a symlinked policy file, fails closed and never quotes its content', async (ctx) => {
    await putIn(outside, 'secret.toml', 'level = "deploy"\nTOPSECRET = 1\n')
    await link(
      join(outside, 'secret.toml'),
      join(repo, '.aerofortress', 'autopilot.toml'),
      'file',
      ctx
    )
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.autopilot).toMatchObject({ fileExists: true, level: 'off', valid: false })
    expect(JSON.stringify(snapshot)).not.toContain('TOPSECRET')
    expect(snapshot.issues[0]).toEqual({
      path: '.aerofortress/autopilot.toml',
      reason: expect.stringContaining('is a symbolic link; skipped')
    })
  })

  it('does not follow a symlinked .aerofortress out of the repo', async (ctx) => {
    await putIn(outside, 'specs/leak.md', '# Leak\nTOPSECRET')
    await link(outside, join(repo, '.aerofortress'), 'junction', ctx)
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.hasAerofortressDir).toBe(false)
    expect(snapshot.specs).toEqual([])
    expect(snapshot.autopilot.level).toBe('off')
    expect(snapshot.issues[0]).toEqual({
      path: '.aerofortress',
      reason: expect.stringContaining('symbolic link')
    })
    expect(JSON.stringify(snapshot)).not.toContain('TOPSECRET')
  })

  it('does not follow a symlinked subfolder out of the repo', async (ctx) => {
    await putIn(outside, 'specs/leak.md', '# Leak\nTOPSECRET')
    await mkdir(join(repo, '.aerofortress'), { recursive: true })
    await link(join(outside, 'specs'), join(repo, '.aerofortress', 'specs'), 'junction', ctx)
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.hasAerofortressDir).toBe(true)
    expect(snapshot.specs).toEqual([])
    expect(snapshot.issues).toEqual([
      { path: '.aerofortress/specs', reason: expect.stringContaining('symbolic link') }
    ])
    expect(JSON.stringify(snapshot)).not.toContain('TOPSECRET')
  })

  it('drops a pipeline def with malformed proof sensors and reports it', async () => {
    await put(
      '.aerofortress/pipelines/bad.toml',
      'name = "bad"\n[[phase]]\nid = "p"\n[[phase.sensor]]\nid = "s"\nexpect = "fail"\nmatch = "x"\n'
    )
    await put('.aerofortress/pipelines/good.toml', 'name = "good"\n')
    const snapshot = await readAeroWorkspace(repo, NOW)
    expect(snapshot.pipelines.defs.map((def) => def.name)).toEqual(['good'])
    expect(snapshot.issues).toEqual([
      { path: '.aerofortress/pipelines/bad.toml', reason: expect.stringContaining('not loaded') }
    ])
  })
})
