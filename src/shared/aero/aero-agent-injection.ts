export type AeroHookEvent = 'SessionStart' | 'UserPromptSubmit'

/**
 * Claude Code saves a hook's output past 10,000 characters to a file and shows the agent only a
 * preview (checked against Claude Code 2.1.331: 9,900 arrives whole, 10,600 is cut). The whole reply
 * stays under this, in bytes, so the same holds whichever way the cap is counted.
 */
export const AERO_HOOK_OUTPUT_LIMIT = 9500
/** Pack budgets to try, in 4-char tokens, largest first: Aero's 12k-char pack does not fit the cap. */
export const AERO_AGENT_PACK_BUDGETS_TOKENS = [2300, 1800, 1300, 900, 500, 250]
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

function fitsAeroHookOutput(event: AeroHookEvent, context: string): boolean {
  return (
    new TextEncoder().encode(formatAeroHookOutput(event, context)).length <= AERO_HOOK_OUTPUT_LIMIT
  )
}

export function formatAeroPackContext(pack: string): string {
  return `## Workspace pack (top of the network ranking)\n${pack}`
}

/**
 * The SessionStart context from the largest pack budget whose whole reply fits the cap; null when the
 * network is empty. `packFor` is the pack for a budget in tokens.
 */
export function fitAeroPackContext(packFor: (budgetTokens: number) => string): string | null {
  for (const budget of AERO_AGENT_PACK_BUDGETS_TOKENS) {
    const pack = packFor(budget)
    if (pack === '') {
      return null
    }
    const context = formatAeroPackContext(pack)
    if (fitsAeroHookOutput('SessionStart', context)) {
      return context
    }
  }
  return null
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

// A scar's text cannot close the envelope: `<` becomes a JSON escape, which parses back to `<`.
function scarsJson(scars: readonly Record<string, unknown>[]): string {
  return JSON.stringify(scars).replaceAll('<', '\\u003c')
}

/**
 * The recall envelope for ranked scars within the cap: the best-ranked scars that fit whole, and when
 * even the first does not, its lesson cut to fit. `scars` is not empty.
 */
export function fitAeroRecallContext(scars: readonly Record<string, unknown>[]): string {
  const render = (list: readonly Record<string, unknown>[]): string =>
    formatAeroRecallContext(scarsJson(list))
  const fits = (list: readonly Record<string, unknown>[]): boolean =>
    fitsAeroHookOutput('UserPromptSubmit', render(list))
  for (let count = scars.length; count >= 1; count -= 1) {
    if (fits(scars.slice(0, count))) {
      return render(scars.slice(0, count))
    }
  }
  const first = scars[0]
  const lesson = [...String(first.lesson ?? '')]
  for (let keep = lesson.length >> 1; keep > 0; keep >>= 1) {
    const cut = [{ ...first, lesson: `${lesson.slice(0, keep).join('')}…` }]
    if (fits(cut)) {
      return render(cut)
    }
  }
  return render([{ id: first.id, title: first.title, scope: first.scope }])
}

export function formatAeroRecallErrorContext(message: string): string {
  return (
    '<NOT_YOU_AGAIN_ERROR>\n' +
    `Host-side scar recall failed: ${message.slice(0, 500)}. Resolve this with \`nya_recall\` before ` +
    'changing tracked files, and do not claim the recurrence gate passed.\n' +
    '</NOT_YOU_AGAIN_ERROR>'
  )
}
