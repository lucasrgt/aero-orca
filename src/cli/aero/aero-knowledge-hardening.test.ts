import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeAeroItemFile } from './aero-item-file-writer'
import { createAeroKnowledgeTools, type AeroKnowledgeTools } from './aero-knowledge-tools'

let root: string
let tools: AeroKnowledgeTools

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aero-hardening-'))
  await mkdir(join(root, '.aerofortress', 'items'), { recursive: true })
  tools = createAeroKnowledgeTools(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const note = {
  slug: 'arch',
  type: 'decision',
  title: 'Use grass green for the CTA',
  body: 'The call to action is grass green.',
  tags: ['ui'],
  provenance: 'dito',
  evidence: 'user chat',
  decay: 'seasonal'
}

const baseFields = {
  slug: 'arch',
  type: 'fact',
  title: 'Hand written',
  tags: '',
  provenance: 'dito',
  evidence: '',
  decay: 'stable',
  created: '2026-11-01T00:00:00+00:00',
  updated: '2026-11-01T00:00:00+00:00',
  validated: '2026-11-01T00:00:00+00:00',
  links: ''
}

const itemsDirectory = () => join(root, '.aerofortress', 'items')
const lockFile = () => join(root, '.aerofortress', '.knowledge.lock')

async function storeNote(extra: Record<string, unknown> = {}): Promise<string> {
  const reply = JSON.parse(await tools.call('store', { ...note, ...extra })) as { id: string }
  return reply.id
}

async function listItemFiles(): Promise<string[]> {
  const entries = await readdir(itemsDirectory(), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.split(sep).join('/'))
}

/** Writes an item file by hand, the way an editor or another tool would leave it. */
async function placeItem(
  folder: string,
  fileName: string,
  fields: Record<string, string>
): Promise<string> {
  const directory = join(itemsDirectory(), folder)
  await mkdir(directory, { recursive: true })
  const file = join(directory, fileName)
  const header = Object.entries({ ...baseFields, ...fields }).map(
    ([key, value]) => `${key}: ${value}`
  )
  await writeFile(file, ['---', ...header, '---', '', 'hand written body', ''].join('\n'))
  return file
}

describe('case-insensitive filesystems', () => {
  it('keeps the item when its cell folder differs only by case and the title is unchanged', async () => {
    const id = await storeNote()
    await rename(join(itemsDirectory(), 'arch'), join(itemsDirectory(), 'Arch'))

    const reply = JSON.parse(await tools.call('store', { ...note, id })) as { ok: boolean }
    expect(reply.ok).toBe(true)
    const read = JSON.parse(await tools.call('read', { id })) as { title: string }
    expect(read.title).toBe(note.title)
    expect(await listItemFiles()).toHaveLength(1)
  })
})

describe('path traversal', () => {
  it('refuses an on-disk id that would write outside items/, and writes nothing', async () => {
    await placeItem('geral', 'evil.md', { id: '../../..-pwn' })
    const before = await readdir(root, { recursive: true })
    await expect(tools.call('store', { ...note, id: '../../..-pwn' })).rejects.toThrow(
      /not a valid id/
    )
    expect(await readdir(root, { recursive: true })).toEqual(before)
    const neighbours = await readdir(dirname(root))
    expect(neighbours.filter((name) => name.includes('pwn'))).toEqual([])
  })

  it('rejects a file name that is not one plain name', async () => {
    for (const name of ['../x.md', 'a/b.md', 'a\\b.md', 'x\0.md', 'a..b.md', '']) {
      await expect(writeAeroItemFile(root, ['geral'], name, 'text', 'create')).rejects.toThrow(
        /plain file name/
      )
    }
  })
})

describe('duplicate ids', () => {
  it('shows two files with one id once, and an update leaves exactly one', async () => {
    const id = '11111111-aaaa-bbbb-cccc-dddddddddddd'
    const older = await placeItem('arch', '11111111-hand.md', { id })
    await placeItem('geral', '11111111-hand.md', {
      id,
      slug: 'geral',
      title: 'Hand written newer',
      updated: '2026-11-10T00:00:00+00:00'
    })
    const hits = JSON.parse(await tools.call('query', { q: 'hand' })) as {
      id: string
      title: string
    }[]
    expect(hits.map((hit) => hit.id)).toEqual([id])
    expect(hits[0].title).toBe('Hand written newer')

    await tools.call('store', { ...note, id })
    const files = await listItemFiles()
    expect(files.filter((file) => file.includes('11111111'))).toHaveLength(1)
    await expect(readFile(older, 'utf8')).rejects.toThrow()
  })
})

describe('Aero-compatible values', () => {
  it('keeps an unknown type through validate and link, normalizing only on store', async () => {
    const id = '22222222-aaaa-bbbb-cccc-dddddddddddd'
    const file = await placeItem('arch', '22222222-custom.md', { id, type: 'custom' })
    await tools.call('validate', { id })
    expect(await readFile(file, 'utf8')).toContain('\ntype: custom\n')
    await tools.call('link', { from: id, to: 'elsewhere', kind: 'references' })
    expect(await readFile(file, 'utf8')).toContain('\ntype: custom\n')
    const read = JSON.parse(await tools.call('read', { id })) as { type: string }
    expect(read.type).toBe('fact')

    await tools.call('store', { ...note, id, type: 'custom' })
    const [stored] = await listItemFiles()
    expect(await readFile(join(itemsDirectory(), stored), 'utf8')).toContain('\ntype: fact\n')
  })

  it('accepts a provenance, decay and link kind outside the vocabulary', async () => {
    const id = await storeNote({ provenance: 'palpite', decay: 'eternal' })
    await tools.call('link', { from: id, to: 'x', kind: 'inspired_by' })
    const [file] = await listItemFiles()
    const text = await readFile(join(itemsDirectory(), file), 'utf8')
    expect(text).toContain('\nprovenance: palpite\n')
    expect(text).toContain('\ndecay: eternal\n')
    expect(text).toContain('\nlinks: inspired_by:x\n')
  })

  it('still refuses an empty title and a link target with a comma or line break', async () => {
    const id = await storeNote()
    await expect(storeNote({ title: '   ' })).rejects.toThrow('title must not be empty')
    await expect(tools.call('link', { from: id, to: 'a,b', kind: 'references' })).rejects.toThrow(
      'to must be an item id'
    )
    await expect(tools.call('link', { from: id, to: 'a\nb', kind: 'references' })).rejects.toThrow(
      'to must be an item id'
    )
  })
})

describe('cross-process lock', () => {
  it('keeps every edge of concurrent links issued through independent stores', async () => {
    const from = await storeNote()
    const other = createAeroKnowledgeTools(root)
    await Promise.all([
      tools.call('link', { from, to: 'first', kind: 'references' }),
      other.call('link', { from, to: 'second', kind: 'references' }),
      tools.call('link', { from, to: 'third', kind: 'depends_on' }),
      other.call('link', { from, to: 'fourth', kind: 'depends_on' })
    ])
    const [file] = await listItemFiles()
    const text = await readFile(join(itemsDirectory(), file), 'utf8')
    for (const target of ['first', 'second', 'third', 'fourth']) {
      expect(text).toContain(`:${target}`)
    }
    await expect(stat(lockFile())).rejects.toThrow()
  })

  it('breaks a lock older than 30 s and a lock whose process is dead', async () => {
    const id = await storeNote()
    await writeFile(lockFile(), JSON.stringify({ pid: process.pid, at: Date.now() - 60_000 }))
    await tools.call('validate', { id })

    const dead = spawnSync(process.execPath, ['-e', ''])
    await writeFile(lockFile(), JSON.stringify({ pid: dead.pid, at: Date.now() }))
    await tools.call('validate', { id })
    await expect(stat(lockFile())).rejects.toThrow()
  })

  it('never lists the lock file as an item', async () => {
    const id = await storeNote()
    await writeFile(lockFile(), JSON.stringify({ pid: process.pid, at: Date.now() }))
    const hits = JSON.parse(await tools.call('query', { q: 'grass' })) as { id: string }[]
    expect(hits.map((hit) => hit.id)).toEqual([id])
  })
})
