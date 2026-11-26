import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAeroNyaScar } from '../../shared/aero/aero-nya'
import { runAeroNyaGit } from './aero-nya-git'
import { AERO_NYA_TOOLS } from './aero-nya-tool-schemas'
import { createAeroNyaTools, type AeroNyaTools } from './aero-nya-tools'
import { ENGLISH_ONLY_SCAR, createAeroNyaTestRepository } from './aero-nya-test-repository'

let root: string
let tools: AeroNyaTools
const cleanup: string[] = []

beforeEach(async () => {
  root = await createAeroNyaTestRepository([ENGLISH_ONLY_SCAR])
  cleanup.push(root)
  tools = createAeroNyaTools(root)
})

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const newScar = {
  title: 'Guessed the org in a URL',
  lesson: 'Read the remote with git remote -v, never from memory.',
  scope: ['docs/**'],
  tags: ['docs']
}

const scarsDirectory = (): string => join(root, '.nya', 'scars')
const scarFiles = async (): Promise<string[]> =>
  (await readdir(scarsDirectory())).filter((name) => name.endsWith('.toml')).sort()

describe('the tools of the server', () => {
  it('offer nya_recall, nya_remember and nya_check with the AeroFortress schemas', () => {
    expect(AERO_NYA_TOOLS.map((tool) => tool.name)).toEqual([
      'nya_recall',
      'nya_remember',
      'nya_check'
    ])
    const [recall, remember, check] = AERO_NYA_TOOLS
    expect(recall.inputSchema.required).toEqual(['task'])
    expect(recall.inputSchema.properties.limit).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 40
    })
    expect(Object.keys(remember.inputSchema.properties)).toEqual([
      'scar',
      'title',
      'lesson',
      'scope',
      'tags',
      'source',
      'github_review',
      'reported_by',
      'corrected_by',
      'recorded_by',
      'workspace'
    ])
    expect(Object.keys(check.inputSchema.properties)).toEqual(['base', 'task', 'workspace'])
    expect(tools.handles('nya_check')).toBe(true)
    expect(tools.handles('store')).toBe(false)
  })
})

describe('nya_recall', () => {
  it('answers with the compact JSON AeroFortress prints, null for an unset occurrence field', async () => {
    const text = await tools.call('nya_recall', {
      task: 'translate the settings text',
      paths: ['src/App.tsx']
    })
    expect(text.startsWith('[{"schema":1,"id":"NYA-01KYASTB1H12GS04SVR3CNF2M9"')).toBe(true)
    expect(text).toContain('"source":null')
    expect(JSON.parse(text)).toHaveLength(1)
  })

  it('requires a task and clamps the limit to 1..40', async () => {
    await expect(tools.call('nya_recall', {})).rejects.toThrow('task is required')
    const two = await tools.call('nya_recall', { task: '', limit: 0 })
    expect(JSON.parse(two)).toHaveLength(1)
  })

  it('fails when the repo has no .nya/scars rather than answering with nothing', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'aero-nya-bare-'))
    cleanup.push(bare)
    await runAeroNyaGit(bare, ['init', '-q'])
    await expect(createAeroNyaTools(bare).call('nya_recall', { task: 'x' })).rejects.toThrow(
      'is not initialized'
    )
  })
})

describe('nya_remember', () => {
  it('writes a new scar file atomically in the format of the Rust serializer and recalls it', async () => {
    const saved = JSON.parse(await tools.call('nya_remember', newScar))
    expect(saved.id).toMatch(/^NYA-[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(saved.occurrences[0]).toMatchObject({
      corrected_by: 'git:dev@example.com',
      recorded_by: 'git:dev@example.com',
      source: null
    })
    const raw = (await readFile(join(scarsDirectory(), `${saved.id}.toml`), 'utf8')).replaceAll(
      '\r\n',
      '\n'
    )
    expect(
      raw.startsWith(`schema = 1\nid = "${saved.id}"\ntitle = "Guessed the org in a URL"\n`)
    ).toBe(true)
    expect(raw).toContain('scope = ["docs/**"]\ntags = ["docs"]\n')
    const parsed = parseAeroNyaScar(raw)
    expect(parsed.ok && parsed.value.occurrences[0].commit).toMatch(/^[0-9a-f]{7,}$/)
    const recalled = JSON.parse(
      await tools.call('nya_recall', { task: 'remote url', paths: ['docs/a.md'] })
    )
    expect(recalled[0].id).toBe(saved.id)
    expect((await readdir(scarsDirectory())).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('appends an occurrence to the file the scar came from, even when it is not named by its id', async () => {
    const renamed = join(scarsDirectory(), 'renamed.toml')
    await writeFile(renamed, await readFile(join(scarsDirectory(), `${ENGLISH_ONLY_SCAR.id}.toml`)))
    await rm(join(scarsDirectory(), `${ENGLISH_ONLY_SCAR.id}.toml`))
    const saved = JSON.parse(await tools.call('nya_remember', { scar: ENGLISH_ONLY_SCAR.id }))
    expect(saved.occurrences).toHaveLength(2)
    expect(await scarFiles()).toEqual(['renamed.toml'])
    const parsed = parseAeroNyaScar(await readFile(renamed, 'utf8'))
    expect(parsed.ok && parsed.value.occurrences).toHaveLength(2)
  })

  it('refuses an invalid scar and writes nothing', async () => {
    await expect(tools.call('nya_remember', { ...newScar, scope: [] })).rejects.toThrow(
      'has no scope'
    )
    await expect(tools.call('nya_remember', { ...newScar, scope: ['a**'] })).rejects.toThrow(
      'invalid scope'
    )
    await expect(
      tools.call('nya_remember', { ...newScar, corrected_by: 'someone' })
    ).rejects.toThrow('namespaced')
    await expect(tools.call('nya_remember', { scar: 'NYA-MISSING' })).rejects.toThrow(
      'was not found'
    )
    expect(await scarFiles()).toEqual([`${ENGLISH_ONLY_SCAR.id}.toml`])
  })

  it('serialises concurrent writers behind the lock: no lost occurrence, no leftovers', async () => {
    await Promise.all(Array.from({ length: 6 }, () => tools.call('nya_remember', newScar)))
    const files = await scarFiles()
    expect(files).toHaveLength(2)
    const created = files.find((name) => !name.startsWith(ENGLISH_ONLY_SCAR.id))
    const parsed = parseAeroNyaScar(await readFile(join(scarsDirectory(), created ?? ''), 'utf8'))
    expect(parsed.ok && parsed.value.occurrences).toHaveLength(6)
    expect(await readdir(join(root, '.nya'))).not.toContain('.scars.lock')
    expect(await runAeroNyaGit(root, ['status', '--porcelain'], { trim: true })).toBe(
      `?? .nya/scars/${created ?? ''}`
    )
  })

  it('does not create .nya in a repo that has none', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'aero-nya-bare-'))
    cleanup.push(bare)
    await runAeroNyaGit(bare, ['init', '-q'])
    await expect(createAeroNyaTools(bare).call('nya_remember', newScar)).rejects.toThrow(
      'is not initialized'
    )
    expect(await readdir(bare)).toEqual(['.git'])
  })

  it('does not write through a symlinked .nya/scars', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'aero-outside-'))
    cleanup.push(outside)
    await rm(scarsDirectory(), { recursive: true })
    await symlink(outside, scarsDirectory(), 'junction')
    await expect(tools.call('nya_remember', newScar)).rejects.toThrow(/symbolic link|outside/)
    expect(await readdir(outside)).toEqual([])
  })

  it('refuses a scar file that is a symlink instead of silently reading fewer scars', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'aero-outside-'))
    cleanup.push(outside)
    const target = join(outside, 'secret.toml')
    await writeFile(target, 'not a scar')
    try {
      await symlink(target, join(scarsDirectory(), 'linked.toml'), 'file')
    } catch {
      return
    }
    await expect(tools.call('nya_recall', { task: 'x' })).rejects.toThrow(
      /linked\.toml.*symbolic link/
    )
  })

  it('refuses a scar file that does not parse, failing the whole read like Aero', async () => {
    await writeFile(join(scarsDirectory(), 'broken.toml'), 'schema = 1\nseverity = "high"\n')
    await expect(tools.call('nya_recall', { task: 'x' })).rejects.toThrow(
      /invalid scar .*broken\.toml/
    )
  })

  it('refuses a scar whose scope is not a valid glob instead of silently reading fewer scars', async () => {
    const original = await readFile(join(scarsDirectory(), `${ENGLISH_ONLY_SCAR.id}.toml`), 'utf8')
    await writeFile(
      join(scarsDirectory(), 'bad-scope.toml'),
      original.replace(ENGLISH_ONLY_SCAR.id, 'NYA-BADSCOPE').replace('"src/**"', '"a**"')
    )
    await expect(tools.call('nya_recall', { task: 'x' })).rejects.toThrow(
      /invalid scar .*bad-scope\.toml.*invalid scope in NYA-BADSCOPE/
    )
  })
})
