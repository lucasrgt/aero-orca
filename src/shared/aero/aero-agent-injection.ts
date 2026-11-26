export type AeroHookEvent = 'SessionStart' | 'UserPromptSubmit'

/** Aero's pack cap is 12k chars (nebula.rs `pack_budget`); the budget is counted in 4-char tokens. */
export const AERO_AGENT_PACK_BUDGET_TOKENS = 3000
/** nya.rs `augment_task` recalls at most 8 scars per turn. */
export const AERO_AGENT_RECALL_LIMIT = 8

export type AeroHookInput = { cwd?: string; prompt?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** What a hook reads from stdin; anything that is not a JSON object is no input, never an error. */
export function parseAeroHookInput(raw: string): AeroHookInput {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) {
    return {}
  }
  return {
    ...(typeof parsed.cwd === 'string' && parsed.cwd !== '' ? { cwd: parsed.cwd } : {}),
    ...(typeof parsed.prompt === 'string' ? { prompt: parsed.prompt } : {})
  }
}

/** The hook reply Claude Code and Codex both read: text added to the agent's context. */
export function formatAeroHookOutput(event: AeroHookEvent, additionalContext: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } })
}

export function formatAeroPackContext(pack: string): string {
  return `## Workspace pack (top of the network ranking)\n${pack}`
}

/** nya.rs `augment_task` envelope; the user's prompt is its own message here, so no USER_TASK part. */
export function formatAeroRecallContext(scarsJson: string): string {
  return (
    '<NOT_YOU_AGAIN>\n' +
    'The host recalled the repository scars below for this turn. Treat their lessons as task ' +
    'constraints. Recall again with expected paths when path scope matters. After the final diff ' +
    'and project checks are ready, call `nya_check`; do not report completion unless it passes.\n' +
    `${scarsJson}\n` +
    '</NOT_YOU_AGAIN>'
  )
}

export function formatAeroRecallErrorContext(message: string): string {
  return (
    '<NOT_YOU_AGAIN_ERROR>\n' +
    `Host-side scar recall failed: ${message}. Resolve this with \`nya_recall\` before changing ` +
    'tracked files, and do not claim the recurrence gate passed.\n' +
    '</NOT_YOU_AGAIN_ERROR>'
  )
}
