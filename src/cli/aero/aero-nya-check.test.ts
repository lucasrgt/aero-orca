import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AeroNyaJudge } from '../../shared/aero/aero-nya-check-audit'
import { makeAeroNyaScar } from '../../shared/aero/aero-nya-test-scars'
import { checkAeroNya } from './aero-nya-operations'
import { collectAeroNyaDiff } from './aero-nya-diff-collector'
import { runAeroNyaGit } from './aero-nya-git'
import { ENGLISH_ONLY_SCAR, createAeroNyaTestRepository } from './aero-nya-test-repository'

let root: string
const cleanup: string[] = []
const savedConfig = process.env.NYA_CONFIG

beforeEach(async () => {
  root = await createAeroNyaTestRepository([
    ENGLISH_ONLY_SCAR,
    makeAeroNyaScar({ id: 'NYA-DOCS', scope: ['docs/**'] })
  ])
  cleanup.push(root)
  process.env.NYA_CONFIG = join(root, 'no-user-config.toml')
})

afterEach(async () => {
  process.env.NYA_CONFIG = savedConfig
  if (savedConfig === undefined) {
    delete process.env.NYA_CONFIG
  }
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const portuguese = async (): Promise<void> => {
  await writeFile(join(root, 'src', 'App.tsx'), 'export const App = () => <h1>Configuracoes</h1>\n')
}

describe('collectAeroNyaDiff', () => {
  it('gathers staged, unstaged and untracked work and leaves .nya out', async () => {
    await portuguese()
    await writeFile(join(root, 'src', 'extra.ts'), 'export const x = 1\r\nexport const y = 2\n')
    await writeFile(join(root, '.nya', 'scars', 'NYA-DRAFT.toml'), 'ignored')
    const { body, paths } = await collectAeroNyaDiff(root, undefined)
    expect(paths.sort()).toEqual(['src/App.tsx', 'src/extra.ts'])
    expect(body).toContain('+export const App = () => <h1>Configuracoes</h1>')
    expect(body).toContain('diff --git a/src/extra.ts b/src/extra.ts\nnew file mode 100644')
    expect(body).toContain('@@ -0,0 +1,2 @@\n+export const x = 1\n+export const y = 2\n')
    expect(body).not.toContain('.nya')
  })

  it('compares against a base so committed work is audited too', async () => {
    await portuguese()
    await runAeroNyaGit(root, ['add', '-A'])
    await runAeroNyaGit(root, ['commit', '-q', '-m', 'portuguese'])
    expect((await collectAeroNyaDiff(root, undefined)).paths).toEqual([])
    expect((await collectAeroNyaDiff(root, 'HEAD~1')).paths).toEqual(['src/App.tsx'])
  })

  it('refuses a base that git could read as an option', async () => {
    await expect(collectAeroNyaDiff(root, '--output=leak.txt')).rejects.toThrow(
      'cannot start with "-"'
    )
  })

  it('does not read an untracked file that is a symlink out of the repo', async () => {
    const outside = join(root, '..', `outside-${Date.now()}.txt`)
    cleanup.push(outside)
    await writeFile(outside, 'TOP SECRET')
    try {
      await symlink(outside, join(root, 'leak.txt'), 'file')
    } catch {
      return
    }
    const { body } = await collectAeroNyaDiff(root, undefined)
    expect(body).not.toContain('TOP SECRET')
  })
})

describe('checkAeroNya', () => {
  const flagging: AeroNyaJudge = async () =>
    JSON.stringify({
      findings: [
        {
          scar_id: ENGLISH_ONLY_SCAR.id,
          path: 'src/App.tsx',
          line: 1,
          evidence: '+export const App = () => <h1>Configuracoes</h1>',
          reason: 'Portuguese interface text'
        }
      ]
    })

  it('flags the recurrence the judge confirms and sends the judge only the scars in scope', async () => {
    await portuguese()
    const prompts: string[] = []
    const result = await checkAeroNya(
      root,
      {},
      {
        resolveJudge: async () => async (prompt) => {
          prompts.push(prompt)
          return flagging(prompt)
        }
      }
    )
    expect(result.passed).toBe(false)
    expect(result.scars_checked).toBe(1)
    expect(result.findings).toHaveLength(1)
    expect(prompts[0]).toContain(ENGLISH_ONLY_SCAR.id)
    expect(prompts[0]).not.toContain('NYA-DOCS')
  })

  it('passes a clean diff and never starts a judge when no scar covers the change', async () => {
    await mkdir(join(root, 'lib'))
    await writeFile(join(root, 'lib', 'a.ts'), 'export {}\n')
    const never = async (): Promise<AeroNyaJudge> => {
      throw new Error('judge must not start')
    }
    expect(await checkAeroNya(root, {}, { resolveJudge: never })).toEqual({
      passed: true,
      scars_checked: 0,
      findings: []
    })
  })

  it('reports a judge that cannot start as an error, not a pass', async () => {
    await portuguese()
    await expect(checkAeroNya(root, {})).rejects.toThrow('judge is not configured')
  })
})

describe('untracked files and an uninitialized repo', () => {
  it('reads a file past 4 MB whole and an invalid UTF-8 file as empty, like Aero', async () => {
    await writeFile(join(root, 'big.txt'), `${'x'.repeat(5 * 1024 * 1024)}\nTAIL-MARKER\n`)
    await writeFile(join(root, 'binary.bin'), Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]))
    const { body, paths } = await collectAeroNyaDiff(root, undefined)
    expect(paths.sort()).toEqual(['big.txt', 'binary.bin'])
    expect(body).toContain('+TAIL-MARKER')
    expect(body).toContain('diff --git a/binary.bin b/binary.bin')
    expect(body).toContain('@@ -0,0 +1,0 @@')
  })

  it('fails the check instead of auditing an untracked file it could not read as empty', async () => {
    await writeFile(join(root, 'busy.txt'), 'content')
    for (const code of ['EBUSY', 'ERR_FS_FILE_TOO_LARGE']) {
      const failing = async (): Promise<Uint8Array> => {
        throw Object.assign(new Error('cannot read'), { code })
      }
      await expect(collectAeroNyaDiff(root, undefined, failing)).rejects.toThrow(
        'cannot audit untracked file busy.txt'
      )
    }
    const vanished = async (): Promise<Uint8Array> => {
      throw Object.assign(new Error('gone'), { code: 'ENOENT' })
    }
    expect((await collectAeroNyaDiff(root, undefined, vanished)).paths).toEqual(['busy.txt'])
  })

  it('reads an untracked file whose name git would quote, where the filesystem allows one', async () => {
    const name = 'we"ird\\name.txt'
    try {
      await writeFile(join(root, name), 'QUOTED-NAME-CONTENT\n')
    } catch {
      return
    }
    const { body, paths } = await collectAeroNyaDiff(root, undefined)
    expect(paths).toEqual([name])
    expect(body).toContain('+QUOTED-NAME-CONTENT')
  })

  it('passes an empty diff without reading the scars of a repo that has none', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'aero-nya-bare-'))
    cleanup.push(bare)
    await runAeroNyaGit(bare, ['init', '-q'])
    await runAeroNyaGit(bare, ['config', 'user.email', 'dev@example.com'])
    await runAeroNyaGit(bare, ['config', 'user.name', 'Dev'])
    await runAeroNyaGit(bare, ['commit', '-q', '--allow-empty', '-m', 'initial'])
    expect(await checkAeroNya(bare, {})).toEqual({ passed: true, scars_checked: 0, findings: [] })
  })
})
