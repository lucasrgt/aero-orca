import type { AeroNyaJudgeConfig } from './aero-nya'

// Mirrors not-you-again's `builtin`: the judge CLIs it knows, each asked for a read-only, tool-less,
// session-less run that answers in the schema. `{schema}` is a file holding the schema, `{schema_json}` the schema itself.
const BUILTIN_JUDGE_COMMANDS: Record<string, readonly string[]> = {
  codex: [
    'codex',
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ignore-user-config',
    '--ignore-rules',
    '--output-schema',
    '{schema}',
    '-'
  ],
  claude: [
    'claude',
    '--safe-mode',
    '--tools',
    '',
    '--no-session-persistence',
    '-p',
    '--json-schema',
    '{schema_json}'
  ],
  hermes: [
    'hermes',
    '--safe-mode',
    '-z',
    'Read the supplied Not You Again task from standard input and return only the requested JSON object.'
  ]
}

export type AeroNyaJudgeSetup = {
  command: string[]
  /** The built-in Codex judge runs with a throwaway CODEX_HOME that holds only the credentials. */
  isolateHome: boolean
  /** A built-in Codex judge needs the network, so it cannot run inside a network-disabled sandbox. */
  externalOnly: boolean
}

export function resolveAeroNyaJudgeSetup(config: AeroNyaJudgeConfig): AeroNyaJudgeSetup {
  const isolateHome = config.judge === 'codex'
  const builtin = Object.hasOwn(BUILTIN_JUDGE_COMMANDS, config.judge)
    ? [...BUILTIN_JUDGE_COMMANDS[config.judge]]
    : undefined
  const command = config.command.length === 0 ? builtin : config.command
  if (command === undefined) {
    throw new Error(`judge \`${config.judge}\` has no command`)
  }
  return { command, isolateHome, externalOnly: isolateHome && config.command.length === 0 }
}

export function substituteAeroNyaJudgeArgs(
  command: readonly string[],
  schemaPath: string,
  schemaJson: string
): string[] {
  return command.map((argument) =>
    argument.replaceAll('{schema}', schemaPath).replaceAll('{schema_json}', schemaJson)
  )
}
