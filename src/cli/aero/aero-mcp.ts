import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'
import { readOrcaCliVersion } from '../cli-version'
import { assertAeroLocalExecution, readAeroPathFlag } from './aero-local-only'
import { serveAeroKnowledge } from './aero-knowledge-mcp-server'
import { resolveAeroKnowledgeRoot } from './aero-knowledge-root'

export const AERO_MCP_HANDLERS: Record<string, CommandHandler> = {
  // stdout carries the protocol, so a failure is an error before the server starts, never a log line.
  'aero mcp': async ({ flags, cwd }) => {
    assertAeroLocalExecution(flags, 'orca aero mcp', 'it serves the repo files of this machine')
    const pathFlag = readAeroPathFlag(flags)
    const root = await resolveAeroKnowledgeRoot(
      pathFlag === undefined ? cwd : resolve(cwd, pathFlag),
      pathFlag !== undefined
    ).catch((error: unknown) => {
      throw new RuntimeClientError(
        'invalid_argument',
        error instanceof Error ? error.message : String(error)
      )
    })
    await serveAeroKnowledge(root, readOrcaCliVersion() ?? '0.0.0')
  }
}
