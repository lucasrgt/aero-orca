import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  parseAeroNyaConfig,
  parseAeroNyaJudgeConfig,
  type AeroNyaJudgeConfig
} from '../../shared/aero/aero-nya'
import { readGuardedFile } from '../../main/aero/aero-workspace-files'
import { runAeroNyaGit } from './aero-nya-git'

export type AeroNyaJudgeSettings = { timeoutSeconds: number; judge: AeroNyaJudgeConfig }

const SETUP_HINT = 'run `nya setup --judge codex|claude|hermes`'

/** dirs::config_dir(), where not-you-again keeps the judge shared by every repo of the user. */
function userConfigDirectory(): string | undefined {
  if (process.platform === 'win32') {
    return process.env.APPDATA
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support')
  }
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

function userConfigPath(): string {
  const override = process.env.NYA_CONFIG
  if (override) {
    return override
  }
  const directory = userConfigDirectory()
  if (!directory) {
    throw new Error('operating system has no user configuration directory')
  }
  return join(directory, 'nya', 'config.toml')
}

function parseJudgeConfig(raw: string, label: string): AeroNyaJudgeConfig {
  const parsed = parseAeroNyaJudgeConfig(raw)
  if (!parsed.ok) {
    throw new Error(`invalid judge configuration ${label}: ${parsed.issues.join('; ')}`)
  }
  if (parsed.value.schema !== 1) {
    throw new Error(`unsupported judge configuration schema ${parsed.value.schema} in ${label}`)
  }
  return parsed.value
}

/** The personal judge file: the user's own, so a symlinked dotfile is fine and absent is normal. */
async function readUserJudgeConfig(): Promise<AeroNyaJudgeConfig | undefined> {
  const path = userConfigPath()
  const entry = await stat(path).catch(() => null)
  return entry?.isFile() ? parseJudgeConfig(await readFile(path, 'utf8'), path) : undefined
}

/**
 * The repo's `.nya/config.local.toml` is gitignored by design. One a repo commits arrived with a
 * clone, not from the developer, so it may not name a command to run.
 */
async function assertLocalConfigIsPersonal(
  root: string,
  config: AeroNyaJudgeConfig
): Promise<void> {
  if (config.command.length === 0) {
    return
  }
  const tracked = await runAeroNyaGit(root, ['ls-files', '--', '.nya/config.local.toml'], {
    trim: true
  })
  if (tracked !== '') {
    throw new Error(
      '.nya/config.local.toml is committed to the repository and names a judge command; refusing to run a command a clone supplied. Untrack it or use a built-in judge'
    )
  }
}

async function readLocalJudgeConfig(root: string): Promise<AeroNyaJudgeConfig | undefined> {
  const read = await readGuardedFile(root, join(root, '.nya', 'config.local.toml'))
  if (read.status === 'missing') {
    return undefined
  }
  if (read.status === 'skipped') {
    throw new Error(`.nya/config.local.toml ${read.reason}`)
  }
  const config = parseJudgeConfig(read.text, '.nya/config.local.toml')
  await assertLocalConfigIsPersonal(root, config)
  return config
}

/** The check timeout of `.nya/config.toml` and the judge: the repo's local file, else the user's. */
export async function readAeroNyaJudgeSettings(root: string): Promise<AeroNyaJudgeSettings> {
  const read = await readGuardedFile(root, join(root, '.nya', 'config.toml'))
  if (read.status !== 'read') {
    throw new Error(
      `.nya/config.toml ${read.status === 'skipped' ? read.reason : 'is missing; run nya init'}`
    )
  }
  const config = parseAeroNyaConfig(read.text)
  if (!config.ok) {
    throw new Error(`invalid .nya/config.toml: ${config.issues.join('; ')}`)
  }
  if (config.value.schema !== 1) {
    throw new Error(`unsupported config schema ${config.value.schema}`)
  }
  const judge = (await readLocalJudgeConfig(root)) ?? (await readUserJudgeConfig())
  if (judge === undefined) {
    throw new Error(`judge is not configured; ${SETUP_HINT}`)
  }
  return { timeoutSeconds: config.value.timeoutSeconds, judge }
}
