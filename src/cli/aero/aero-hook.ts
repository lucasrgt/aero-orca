import { parseAeroHookInput, formatAeroHookOutput } from '../../shared/aero/aero-agent-injection'
import type { AeroHookEvent } from '../../shared/aero/aero-agent-injection'
import type { CommandHandler } from '../dispatch/dispatch'
import { aeroPromptRecallContext, aeroSessionStartContext } from './aero-agent-context'
import { assertAeroLocalExecution } from './aero-local-only'

const STDIN_TIMEOUT_MS = 3_000
const STDIN_MAX_BYTES = 4 * 1024 * 1024

async function readHookStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''
  }
  const chunks: Buffer[] = []
  let size = 0
  const read = (async () => {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      size += buffer.length
      if (size > STDIN_MAX_BYTES) {
        return
      }
      chunks.push(buffer)
    }
  })()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<void>((done) => {
    timer = setTimeout(done, STDIN_TIMEOUT_MS)
  })
  await Promise.race([read, timeout])
  clearTimeout(timer)
  return size > STDIN_MAX_BYTES ? '' : Buffer.concat(chunks).toString('utf8')
}

/**
 * A hook never fails its agent: every error becomes a line on stderr and an empty stdout, which
 * both Claude Code and Codex read as "nothing to add". stdout carries only the reply JSON.
 */
async function runHook(
  command: string,
  event: AeroHookEvent,
  flags: ReadonlyMap<string, string | boolean>,
  cwd: string,
  build: (input: ReturnType<typeof parseAeroHookInput>, cwd: string) => Promise<string | null>
): Promise<void> {
  try {
    assertAeroLocalExecution(flags, command, 'it reads the repo files of this machine')
    const input = parseAeroHookInput(await readHookStdin())
    const context = await build(input, input.cwd ?? cwd)
    if (context !== null) {
      process.stdout.write(`${formatAeroHookOutput(event, context)}\n`)
    }
  } catch (error) {
    console.error(`${command}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const AERO_HOOK_HANDLERS: Record<string, CommandHandler> = {
  'aero hook session-start': ({ flags, cwd }) =>
    runHook('orca aero hook session-start', 'SessionStart', flags, cwd, (_input, at) =>
      aeroSessionStartContext(at, new Date())
    ),
  'aero hook prompt-submit': ({ flags, cwd }) =>
    runHook('orca aero hook prompt-submit', 'UserPromptSubmit', flags, cwd, (input, at) =>
      input.prompt && input.prompt.trim() !== ''
        ? aeroPromptRecallContext(at, input.prompt)
        : Promise.resolve(null)
    )
}
