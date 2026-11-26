import { mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAeroNyaGit } from './aero-nya-git'
import { readAeroNyaJudgeSettings } from './aero-nya-judge-config'
import { createAeroNyaTestRepository } from './aero-nya-test-repository'

let root: string
const cleanup: string[] = []
const savedConfig = process.env.NYA_CONFIG

beforeEach(async () => {
  root = await createAeroNyaTestRepository()
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

const COMMAND = 'schema = 1\njudge = "custom"\ncommand = ["node", "judge.js"]\n'
const localConfig = (text: string, name = 'config.local.toml') =>
  writeFile(join(root, '.nya', name), text)

async function userConfig(text: string): Promise<void> {
  const outside = await mkdtemp(join(tmpdir(), 'aero-nya-user-'))
  cleanup.push(outside)
  process.env.NYA_CONFIG = join(outside, 'config.toml')
  await writeFile(process.env.NYA_CONFIG, text)
}

describe('readAeroNyaJudgeSettings', () => {
  it('reads the timeout of .nya/config.toml and a built-in judge picked by the local file', async () => {
    await localConfig('schema = 1\njudge = "claude"\ncommand = []\n')
    expect(await readAeroNyaJudgeSettings(root)).toEqual({
      timeoutSeconds: 60,
      judge: { schema: 1, judge: 'claude', command: [] }
    })
  })

  it('takes the judge and its command from the user config named by NYA_CONFIG', async () => {
    await userConfig(COMMAND)
    expect((await readAeroNyaJudgeSettings(root)).judge).toEqual({
      schema: 1,
      judge: 'custom',
      command: ['node', 'judge.js']
    })
  })

  it('lets the local file pick a built-in judge over the user config', async () => {
    await userConfig(COMMAND)
    await localConfig('schema = 1\njudge = "codex"\n')
    expect((await readAeroNyaJudgeSettings(root)).judge).toMatchObject({
      judge: 'codex',
      command: []
    })
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

  it('rejects a timeout Node would fire at once', async () => {
    await localConfig('schema = 1\njudge = "claude"\n')
    await writeFile(
      join(root, '.nya', 'config.toml'),
      'schema = 1\n\n[check]\ntimeout_seconds = 2147484\n'
    )
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('timeout_seconds must be at most')
  })
})

describe('a judge command that a clone could carry', () => {
  it('is refused in the local config whether untracked, ignored, committed or not ignored', async () => {
    await localConfig(COMMAND)
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('names a judge command')
    await runAeroNyaGit(root, ['add', '-f', '.nya/config.local.toml'])
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('names a judge command')
    await runAeroNyaGit(root, ['rm', '-q', '--cached', '.nya/config.local.toml'])
    await writeFile(join(root, '.nya', '.gitignore'), 'index-v1.sqlite3\n')
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('names a judge command')
  })

  it('is refused under a case variant the filesystem opens as the local config', async () => {
    await localConfig(COMMAND, 'Config.Local.toml')
    await runAeroNyaGit(root, ['add', '-f', '.nya/Config.Local.toml'])
    // Where the filesystem is case-sensitive the variant is simply not the local config.
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow(
      /names a judge command|judge is not configured/
    )
  })

  it('is refused even when the user config would have supplied one, so the repo cannot win', async () => {
    await userConfig('schema = 1\njudge = "claude"\n')
    await localConfig(COMMAND)
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow('names a judge command')
  })

  it('is refused when .nya is a link to another directory of the clone', async () => {
    await rename(join(root, '.nya'), join(root, 'tools-store'))
    try {
      await symlink(join(root, 'tools-store'), join(root, '.nya'), 'junction')
    } catch {
      return
    }
    await expect(readAeroNyaJudgeSettings(root)).rejects.toThrow(/\.nya .*symbolic link/)
  })
})
