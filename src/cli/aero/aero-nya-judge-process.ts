import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { resolveCliCommand } from '../../shared/shell/command-resolution/node-cli-command-resolution'
import {
  resolveAeroNyaJudgeSetup,
  substituteAeroNyaJudgeArgs,
  type AeroNyaJudgeSetup
} from '../../shared/aero/aero-nya-judge-command'
import type { AeroNyaJudge } from '../../shared/aero/aero-nya-check-audit'
import { AERO_NYA_FINDINGS_SCHEMA } from '../../shared/aero/aero-nya-judge'
import { readAeroNyaJudgeSettings } from './aero-nya-judge-config'

const JUDGE_MAX_OUTPUT_BYTES = 16 * 1024 * 1024

async function copyCodexCredentials(destination: string): Promise<void> {
  const source = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'auth.json')
  if ((await stat(source).catch(() => null))?.isFile()) {
    await copyFile(source, join(destination, 'auth.json'))
  }
}

/**
 * One judge run: a throwaway working directory (the judge sees no repo file), the prompt on stdin,
 * the arguments as an array and never through a shell. A non-zero exit or a timeout is an error.
 */
async function runJudgeProcess(
  setup: AeroNyaJudgeSetup,
  timeoutSeconds: number,
  prompt: string
): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), 'nya-judge-'))
  const working = await mkdtemp(join(tmpdir(), 'nya-judge-cwd-'))
  try {
    const schemaPath = join(scratch, 'schema.json')
    const schemaJson = JSON.stringify(AERO_NYA_FINDINGS_SCHEMA)
    await writeFile(schemaPath, schemaJson, 'utf8')
    const [program, ...args] = substituteAeroNyaJudgeArgs(setup.command, schemaPath, schemaJson)
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (setup.isolateHome) {
      await copyCodexCredentials(working)
      env.CODEX_HOME = working
    }
    const result = await runProcess({
      program: resolveCliCommand(program),
      args,
      cwd: working,
      env,
      input: prompt,
      timeoutMs: timeoutSeconds * 1000,
      maxOutputBytes: JUDGE_MAX_OUTPUT_BYTES
    })
    if (result.timedOut) {
      throw new Error(`judge timed out after ${timeoutSeconds} seconds`)
    }
    if (result.code !== 0) {
      const exit = result.code === null ? `signal ${result.signal}` : `code ${result.code}`
      throw new Error(`judge exited with ${exit}: ${result.stderr.trim()}`)
    }
    if (result.outputTruncated) {
      throw new Error('judge output exceeded the size limit')
    }
    return result.stdout
  } finally {
    await rm(scratch, { recursive: true, force: true })
    await rm(working, { recursive: true, force: true })
  }
}

/** The judge of a repo, configured as in `.nya/config.toml`, `.nya/config.local.toml` or the user's file. */
export async function resolveAeroNyaJudge(root: string): Promise<AeroNyaJudge> {
  const { timeoutSeconds, judge } = await readAeroNyaJudgeSettings(root)
  const setup = resolveAeroNyaJudgeSetup(judge)
  if (setup.externalOnly && process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1') {
    throw new Error(
      'the built-in Codex judge cannot run inside a network-disabled agent sandbox; delegate it to the host, MCP server, or CI'
    )
  }
  return (prompt) => runJudgeProcess(setup, timeoutSeconds, prompt)
}
