import type { CommandHandler } from '../dispatch/dispatch'
import { AERO_HOOK_HANDLERS } from './aero-hook'

// The server loads on its own so a hook, which runs before every prompt, never pays for it.
export const AERO_AGENT_HANDLERS: Record<string, CommandHandler> = {
  'aero mcp': async (context) =>
    (await import('./aero-mcp.js')).AERO_MCP_HANDLERS['aero mcp'](context),
  ...AERO_HOOK_HANDLERS
}
