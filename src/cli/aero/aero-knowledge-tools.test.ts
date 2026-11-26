import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAeroKnowledgeItem } from '../../shared/aero/aero-knowledge-item'
import { createAeroKnowledgeTools, type AeroKnowledgeTools } from './aero-knowledge-tools'

let root: string
let tools: AeroKnowledgeTools

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aero-knowledge-'))
  await mkdir(join(root, '.aerofortress', 'items'), { recursive: true })
  tools = createAeroKnowledgeTools(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const note = {
  slug: 'Design/Colors',
  type: 'decision',
  title: 'Use grass green — for the CTA',
  body: 'The call to action is grass green.\n\nWhy: contrast.',
  tags: ['ui', 'colors, brand'],
  provenance: 'dito',
  evidence: 'user chat',
  decay: 'seasonal'
}

async function storeNote(extra: Record<string, unknown> = {}): Promise<string> {
  const reply = JSON.parse(await tools.call('store', { ...note, ...extra })) as { id: string }
  return reply.id
}

async function listItemFiles(): Promise<string[]> {
  const entries = await readdir(join(root, '.aerofortress', 'items'), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.split(sep).join('/'))
}

describe('store then read', () => {
  it('persists the item in Aero format under its cell and reads it back through every tool', async () => {
    const id = await storeNote()
    const [relative] = await listItemFiles()
    expect(relative).toBe(`design/colors/${id.slice(0, 8)}-use-grass-green-for-the-cta.md`)

    const text = await readFile(join(root, '.aerofortress', 'items', relative), 'utf8')
    expect(
      text
        .split('\n')
        .slice(0, 14)
        .map((line) => line.split(':')[0])
    ).toEqual([
      '---',
      'id',
      'slug',
      'type',
      'title',
      'tags',
      'provenance',
      'evidence',
      'decay',
      'created',
      'updated',
      'validated',
      'links',
      '---'
    ])
    const parsed = parseAeroKnowledgeItem(text, relative, new Date())
    expect(parsed.ok && parsed.value).toMatchObject({
      id,
      slug: 'design/colors',
      type: 'decision',
      tags: ['ui', 'colors  brand'],
      decay: 'seasonal',
      evidence: 'user chat',
      created: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+\+00:00$/)
    })

    const read = JSON.parse(await tools.call('read', { id })) as { body: string; title: string }
    expect(read.title).toBe(note.title)
    expect(read.body).toBe(note.body)
    const found = JSON.parse(await tools.call('query', { q: 'grass green' })) as { id: string }[]
    expect(found.map((hit) => hit.id)).toEqual([id])
  })

  it('updates by id in place, moves the file with the cell, and keeps links and creation time', async () => {
    const id = await storeNote()
    const other = await storeNote({ title: 'Another note', slug: 'geral' })
    await tools.call('link', { from: id, to: other, kind: 'references' })
    const before = JSON.parse(await tools.call('read', { id })) as { createdAt: string }

    await tools.call('store', { ...note, id, slug: 'arch', body: 'rewritten' })
    const files = await listItemFiles()
    expect(files.filter((file) => file.includes(id.slice(0, 8)))).toEqual([
      `arch/${id.slice(0, 8)}-use-grass-green-for-the-cta.md`
    ])
    const after = JSON.parse(await tools.call('read', { id })) as {
      createdAt: string
      body: string
      links_out: { id: string; kind: string }[]
    }
    expect(after.body).toBe('rewritten')
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.links_out).toMatchObject([{ id: other, kind: 'references' }])
  })

  it('persists replaces so the retired item is flagged and ranked down', async () => {
    const old = await storeNote({ title: 'Palette old', body: 'palette colors' })
    const next = await storeNote({ title: 'Palette new', body: 'palette colors' })
    await tools.call('link', { from: next, to: old, kind: 'replaces' })
    await tools.call('link', { from: next, to: old, kind: 'replaces' })
    const hits = JSON.parse(await tools.call('query', { q: 'palette' })) as {
      id: string
      replaced?: boolean
    }[]
    expect(hits.map((hit) => hit.id)).toEqual([next, old])
    expect(hits[1].replaced).toBe(true)
    const text = await readFile(
      join(
        root,
        '.aerofortress',
        'items',
        'design',
        'colors',
        `${next.slice(0, 8)}-palette-new.md`
      ),
      'utf8'
    )
    expect(text).toContain(`\nlinks: replaces:${old}\n`)
  })

  it('validate moves only the validated stamp', async () => {
    const id = await storeNote()
    const [relative] = await listItemFiles()
    const file = join(root, '.aerofortress', 'items', relative)
    const old = (await readFile(file, 'utf8')).replace(
      /^validated: .*$/m,
      'validated: 2020-01-01T00:00:00+00:00'
    )
    await writeFile(file, old)
    await tools.call('validate', { id })
    const text = await readFile(file, 'utf8')
    expect(text).not.toContain('2020-01-01')
    expect(text.replace(/^validated: .*$/m, '')).toBe(old.replace(/^validated: .*$/m, ''))
  })

  it('does not follow a symlinked cell out of .aerofortress/items', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'aero-outside-'))
    try {
      await symlink(outside, join(root, '.aerofortress', 'items', 'escape'), 'junction')
      await expect(storeNote({ slug: 'escape' })).rejects.toThrow(/cannot be written to/)
      expect(await readdir(outside)).toEqual([])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects an unknown id on update, link and validate', async () => {
    await expect(tools.call('store', { ...note, id: 'nope' })).rejects.toThrow(
      'item não encontrado: nope'
    )
    await expect(tools.call('link', { from: 'nope', to: 'x', kind: 'references' })).rejects.toThrow(
      'item não encontrado'
    )
    await expect(tools.call('validate', { id: 'nope' })).rejects.toThrow('item não encontrado')
    expect(await listItemFiles()).toEqual([])
  })
})
