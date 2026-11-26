import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addAeroKanbanCard } from '../../shared/aero/aero-kanban-card-ops'
import { readString, readTables } from '../../shared/aero/aero-kanban-tables'
import { renderAeroTomlDocument } from '../../shared/aero/aero-toml-document-writer'
import { parseAeroKanbanDocument } from '../../shared/aero/aero-kanban-document'
import { createAeroKanbanStore } from './aero-kanban-store'
import { createAeroKanbanTools } from './aero-kanban-tools'

const EMPTY_BOARD =
  'name = "shared"\nmode = "monolith"\npipeline = ""\ncard = []\n\n[[column]]\nid = "backlog"\ntitle = "Backlog"\npipeline = ""\n'

let root: string
let kanban: string
const outsiders: string[] = []

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'aero-kanban-')))
  kanban = join(root, '.aerofortress', 'kanban')
  await mkdir(kanban, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  for (const outsider of outsiders.splice(0)) {
    await rm(outsider, { recursive: true, force: true })
  }
})

async function titlesOn(board: string): Promise<string[]> {
  const text = await readFile(join(kanban, `${board}.toml`), 'utf8')
  const parsed = parseAeroKanbanDocument(text, board)
  return readTables(parsed.tree, 'card').map((card) => readString(card, 'title'))
}

describe('a board it must not write', () => {
  it('is never overwritten when it does not parse', async () => {
    const broken = 'name = "broken\n[[card]\n'
    await writeFile(join(kanban, 'broken.toml'), broken)
    const tools = createAeroKanbanTools(root)

    await expect(tools.call('kanban_card_add', { board: 'broken', title: 'x' })).rejects.toThrow(
      /does not parse/
    )
    await expect(tools.call('kanban_board', { board: 'broken' })).rejects.toThrow(/does not parse/)
    expect(await readFile(join(kanban, 'broken.toml'), 'utf8')).toBe(broken)
    expect(await readdir(kanban)).toEqual(['broken.toml'])
  })

  it('is never normalised when it is not in the form Aero writes', async () => {
    const handWritten = `# my board\n${EMPTY_BOARD}`
    await writeFile(join(kanban, 'shared.toml'), handWritten)
    const tools = createAeroKanbanTools(root)

    await expect(tools.call('kanban_card_add', { board: 'shared', title: 'x' })).rejects.toThrow(
      /refusing to rewrite/
    )
    expect(await readFile(join(kanban, 'shared.toml'), 'utf8')).toBe(handWritten)
    const read: { name: string } = JSON.parse(await tools.call('kanban_board', { board: 'shared' }))
    expect(read.name).toBe('shared')
  })

  it('cannot be named out of the kanban folder', async () => {
    const tools = createAeroKanbanTools(root)
    for (const board of ['../../escape', 'a/b', 'C:\\temp\\x', '..']) {
      await tools.call('kanban_card_add', { board, title: 'x' })
    }
    expect((await readdir(kanban)).sort()).toEqual([
      'a-b.toml',
      'c-temp-x.toml',
      'card.toml',
      'escape.toml'
    ])
    expect(await readdir(join(root, '.aerofortress'))).toEqual(['kanban'])
  })

  it('is refused when the kanban folder is a link out of the repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'aero-kanban-outside-'))
    outsiders.push(outside)
    await rm(kanban, { recursive: true })
    await symlink(outside, kanban, 'junction')
    const tools = createAeroKanbanTools(root)

    await expect(tools.call('kanban_card_add', { board: 'work', title: 'x' })).rejects.toThrow(
      /cannot be written to|kanban folder/
    )
    await expect(tools.call('kanban_board', { board: 'work' })).rejects.toThrow(/kanban folder/)
    expect(await readdir(outside)).toEqual([])
  })
})

describe('a board written from several places', () => {
  it('keeps the edit another program made between the read and the rename', async () => {
    await writeFile(join(kanban, 'shared.toml'), EMPTY_BOARD)
    const store = createAeroKanbanStore(root)
    let attempts = 0

    await store.transact({ required: ['shared'] }, (boards) => {
      attempts += 1
      const document = boards.get('shared')
      if (document === undefined) {
        throw new Error('board missing')
      }
      if (attempts === 1) {
        const rival = parseAeroKanbanDocument(EMPTY_BOARD, 'shared')
        addAeroKanbanCard(rival, { title: 'by the app', desc: '', pipeline: '' }, 't')
        // the AeroFortress app writing the file while this edit is in flight
        writeFileSync(join(kanban, 'shared.toml'), renderAeroTomlDocument(rival.tree))
      }
      addAeroKanbanCard(document, { title: 'by orca', desc: '', pipeline: '' }, 't')
      return { changed: ['shared'], result: undefined }
    })

    expect(attempts).toBe(2)
    expect((await titlesOn('shared')).sort()).toEqual(['by orca', 'by the app'])
  })
})

const SOURCE_DIRECTORY = resolve('src/cli/aero')
let bundleDirectory: string
let writerScript: string

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'aero-kanban-bundle-'))
  writerScript = join(bundleDirectory, 'writer.cjs')
  const tools = resolve(SOURCE_DIRECTORY, 'aero-kanban-tools.ts').replaceAll('\\', '/')
  await build({
    stdin: {
      contents: `
        import { createAeroKanbanTools } from '${tools}'
        const [root, board, prefix, count] = process.argv.slice(2)
        const tools = createAeroKanbanTools(root)
        async function main() {
          for (let index = 0; index < Number(count); index += 1) {
            await tools.call('kanban_card_add', { board, title: prefix + ' ' + index })
          }
        }
        main().catch((error) => { console.error(error); process.exit(1) })
      `,
      resolveDir: SOURCE_DIRECTORY,
      loader: 'ts'
    },
    outfile: writerScript,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent'
  })
})

afterAll(() => rm(bundleDirectory, { recursive: true, force: true }))

function runWriter(prefix: string, count: number): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [writerScript, root, 'shared', prefix, String(count)], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(stderr))))
  })
}

describe('parallel writers', () => {
  it('lose no card when several processes add to one board', async () => {
    await writeFile(join(kanban, 'shared.toml'), EMPTY_BOARD)
    const writers = 4
    const each = 6

    await Promise.all(Array.from({ length: writers }, (_, index) => runWriter(`w${index}`, each)))

    const titles = await titlesOn('shared')
    expect(titles).toHaveLength(writers * each)
    expect(new Set(titles).size).toBe(writers * each)
    expect(await readdir(kanban)).toEqual(['shared.toml'])
  }, 60_000)
})
