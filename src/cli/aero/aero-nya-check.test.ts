import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AeroNyaJudge } from '../../shared/aero/aero-nya-check-audit'
import { makeAeroNyaScar } from '../../shared/aero/aero-nya-test-scars'
import { checkAeroNya } from './aero-nya-operations'
import { collectAeroNyaDiff } from './aero-nya-diff-collector'
import { runAeroNyaGit } from './aero-nya-git'
import { readAeroNyaJudgeSettings } from './aero-nya-judge-config'
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

describe('readAeroNyaJudgeSettings', () => {
  const localConfig = (text: string) => writeFile(join(root, '.nya', 'config.local.toml'), text)

  it('reads the timeout of .nya/config.toml and the judge of the local file', async () => {
    await localConfig('schema = 1\njudge = "claude"\ncommand = []\n')
    expect(await readAeroNyaJudgeSettings(root)).toEqual({
      timeoutSeconds: 60,
      judge: { schema: 1, judge: 'claude', command: [] }
    })
  })

  it('falls back to the user config named by NYA_CONFIG', async () => {
    const user = join(root, 'user-nya.toml')
    await writeFile(user, 'schema = 1\njudge = "codex"\n')
    process.env.NYA_CONFIG = user
    expect((await readAeroNyaJudgeSettings(root)).judge).toMatchObject({ judge: 'codex' })
  })

  it('refuses a missing judge, an unsupported schema and a repo config that is not there', async () => {
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('judge is not configured')
    await localConfig('schema = 2\njudge = "claude"\n')
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow(
      'unsupported judge configuration schema 2'
    )
    await rm(join(root, '.nya', 'config.toml'))
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('.nya/config.toml is missing')
  })

  it('refuses a judge command that arrived committed in the repo, but not a personal one', async () => {
    await localConfig('schema = 1\njudge = "custom"\ncommand = ["node", "judge.js"]\n')
    expect((await readAeroNyaJudgeSettings(root)).judge.command).toEqual(['node', 'judge.js'])
    await runAeroNyaGit(root, ['add', '-f', '.nya/config.local.toml'])
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow(
      'refusing to run a command a clone supplied'
    )
  })
})
