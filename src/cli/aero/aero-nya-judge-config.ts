import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  parseAeroNyaConfig,
  parseAeroNyaJudgeConfig,
  type AeroNyaJudgeConfig
} from '../../shared/aero/aero-nya'
import { probeDirectory, readGuardedFile } from '../../main/aero/aero-workspace-files'

export type AeroNyaJudgeSettings = { timeoutSeconds: number; judge: AeroNyaJudgeConfig }

// setTimeout fires at once for anything past 2^31-1 ms, which would time every judge out instantly.
const MAX_TIMEOUT_SECONDS = Math.floor(2_147_483_647 / 1000)
const SETUP_HINT = 'run `nya setup --judge codex|claude|hermes`'

/** dirs::config_dir(), where not-you-again keeps the judge shared by every repo of the user. */
function userConfigDirectory(): string | undefined {
  if (process.platform === 'win32') {
    return process.env.APPDATA
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support')
  }
  // The XDG spec and the dirs crate ignore a relative XDG_CONFIG_HOME.
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config')
}

export function userConfigPath(): string {
  const override = process.env.NYA_CONFIG
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error('NYA_CONFIG must be an absolute path')
    }
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
 * The repo's `.nya/config.local.toml` may only pick a built-in judge by name. A command is code to
 * run and a clone can carry this file under any name or short name, so no check of the file's path
 * or git state could vouch for it: a command comes from the user's own config outside the repo.
 */
async function readLocalJudgeConfig(root: string): Promise<AeroNyaJudgeConfig | undefined> {
  const read = await readGuardedFile(root, join(root, '.nya', 'config.local.toml'))
  if (read.status === 'missing') {
    return undefined
  }
  if (read.status === 'skipped') {
    throw new Error(`.nya/config.local.toml ${read.reason}`)
  }
  const config = parseJudgeConfig(read.text, '.nya/config.local.toml')
  if (config.command.length > 0) {
    throw new Error(
      `.nya/config.local.toml names a judge command; a repository may only select a built-in judge (claude, codex or hermes). Put a custom command in your own config (the file NYA_CONFIG names, else nya/config.toml in your user config directory)`
    )
  }
  return config
}

/** The check timeout of `.nya/config.toml` and the judge: the repo's local choice of a built-in one, else the user's config. */
export async function readAeroNyaJudgeSettings(root: string): Promise<AeroNyaJudgeSettings> {
  // A `.nya` that is a link could stand for any tracked directory of the clone.
  const store = await probeDirectory(root, join(root, '.nya'))
  if (store.status === 'skipped') {
    throw new Error(`.nya ${store.reason}`)
  }
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
  if (config.value.timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new Error(
      `invalid .nya/config.toml: [check] timeout_seconds must be at most ${MAX_TIMEOUT_SECONDS}`
    )
  }
  const local = await readLocalJudgeConfig(root)
  const user = await readUserJudgeConfig()
  // A command of the user's own wins, so a clone cannot send the diff to a cloud judge instead.
  const judge = user !== undefined && user.command.length > 0 ? user : (local ?? user)
  if (judge === undefined) {
    throw new Error(`judge is not configured; ${SETUP_HINT}`)
  }
  return { timeoutSeconds: config.value.timeoutSeconds, judge }
}
