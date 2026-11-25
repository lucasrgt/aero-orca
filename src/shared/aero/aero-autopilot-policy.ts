import { z } from 'zod'
import { describeZodIssues } from './aero-parse-result'
import { aeroI64, parseAeroToml } from './aero-toml-integers'

export const AERO_AUTOPILOT_LEVELS = ['off', 'suggest', 'pr', 'merge', 'deploy'] as const
const SOURCES = ['kanban', 'github']
const STRATEGIES = ['merge', 'squash', 'rebase']

// autopilot.rs derives deny_unknown_fields everywhere: a typo must never silently widen the policy.
const AeroAutopilotPolicySchema = z.strictObject({
  level: z.string().default('suggest'),
  sources: z.array(z.string()).default(['kanban']),
  board: z.string().default('autopilot'),
  github_label: z.string().default('agent-ready'),
  trusted_authors: z.array(z.string()).default([]),
  base_branch: z.string().default('main'),
  max_parallel: aeroI64.default(3),
  daily_runs: aeroI64.default(4),
  weekly_reserve_pct: aeroI64.default(20),
  checks: z
    .strictObject({
      build: z.string().default(''),
      test: z.string().default(''),
      e2e: z.string().default(''),
      doctor: z.string().default('')
    })
    .prefault({}),
  merge: z
    .strictObject({
      strategy: z.string().default('merge'),
      require_ci: z.boolean().default(true),
      protected_paths: z.array(z.string()).default(['.github/**', '**/migrations/**']),
      ci_timeout_min: aeroI64.default(60)
    })
    .prefault({}),
  deploy: z
    .strictObject({
      command: z.string().default(''),
      require_approval: z.boolean().default(true),
      timeout_min: aeroI64.default(30)
    })
    .prefault({}),
  suggest: z.strictObject({ max_per_day: aeroI64.default(3) }).prefault({})
})

export type AeroAutopilotPolicy = z.infer<typeof AeroAutopilotPolicySchema>

export type AeroAutopilotReading = {
  fileExists: boolean
  /**
   * What the repo's own policy allows (`LoadedPolicy::policy_level`): `pr` when the file is absent (the
   * repo declares no ceiling), `off` when it is unreadable, corrupt or invalid.
   */
  level: string
  declaredLevel: string
  valid: boolean
  errors: string[]
  policy: AeroAutopilotPolicy
}

function defaultAeroAutopilotPolicy(level: string): AeroAutopilotPolicy {
  return { ...AeroAutopilotPolicySchema.parse({}), level }
}

/** Lower-case and trim the enum-like keys so `Level = "PR"`-style slips are not errors. */
function normalizeAeroAutopilotPolicy(policy: AeroAutopilotPolicy): AeroAutopilotPolicy {
  return {
    ...policy,
    level: policy.level.trim().toLowerCase(),
    sources: policy.sources.map((source) => source.trim().toLowerCase()),
    board: policy.board.trim(),
    github_label: policy.github_label.trim(),
    trusted_authors: policy.trusted_authors.map((author) =>
      author.trim().replace(/^@+/, '').toLowerCase()
    ),
    base_branch: policy.base_branch.trim(),
    merge: { ...policy.merge, strategy: policy.merge.strategy.trim().toLowerCase() },
    deploy: { ...policy.deploy, command: policy.deploy.command.trim() }
  }
}

function outOfRange(key: string, value: number, min: number, max: number): string[] {
  return value >= min && value <= max
    ? []
    : [`${key} must be between ${min} and ${max} (got ${value})`]
}

/** autopilot.rs `validate`: every problem with a parsed policy, in plain words. */
export function validateAeroAutopilotPolicy(policy: AeroAutopilotPolicy): string[] {
  const errors: string[] = []
  if (!(AERO_AUTOPILOT_LEVELS as readonly string[]).includes(policy.level)) {
    errors.push(
      `level '${policy.level}' is unknown; use one of: ${AERO_AUTOPILOT_LEVELS.join(', ')}`
    )
  }
  for (const source of policy.sources) {
    if (!SOURCES.includes(source)) {
      errors.push(`sources has unknown entry '${source}'; use: ${SOURCES.join(', ')}`)
    }
  }
  if (policy.sources.length === 0) {
    errors.push('sources is empty; list at least one of: kanban, github')
  }
  if (!/[A-Za-z0-9]/.test(policy.board)) {
    errors.push('board must name a kanban board (letters or digits)')
  }
  if (policy.trusted_authors.some((author) => !/^[A-Za-z0-9[\]-]+$/.test(author))) {
    errors.push('trusted_authors must list GitHub logins (letters, digits and dashes)')
  }
  if (policy.sources.includes('github') && policy.github_label.length === 0) {
    errors.push('github_label is empty but sources includes github')
  }
  if (
    policy.base_branch.length === 0 ||
    /\s/.test(policy.base_branch) ||
    policy.base_branch.startsWith('-')
  ) {
    errors.push(`base_branch '${policy.base_branch}' is not a valid branch name`)
  }
  errors.push(...outOfRange('max_parallel', policy.max_parallel, 1, 8))
  errors.push(...outOfRange('daily_runs', policy.daily_runs, 1, 200))
  errors.push(...outOfRange('weekly_reserve_pct', policy.weekly_reserve_pct, 0, 100))
  if (!STRATEGIES.includes(policy.merge.strategy)) {
    errors.push(
      `merge.strategy '${policy.merge.strategy}' is unknown; use one of: ${STRATEGIES.join(', ')}`
    )
  }
  if (policy.merge.protected_paths.some((glob) => glob.trim().length === 0)) {
    errors.push('merge.protected_paths has an empty pattern')
  }
  errors.push(...outOfRange('merge.ci_timeout_min', policy.merge.ci_timeout_min, 1, 24 * 60))
  errors.push(...outOfRange('deploy.timeout_min', policy.deploy.timeout_min, 1, 8 * 60))
  errors.push(...outOfRange('suggest.max_per_day', policy.suggest.max_per_day, 1, 10))
  if (policy.level === 'deploy' && policy.deploy.command.length === 0) {
    errors.push("level 'deploy' requires deploy.command (an empty command means never deploy)")
  }
  return errors
}

/** autopilot.rs `NO_FILE_LEVEL`: with no policy file the repo sets no ceiling, so the user's grant decides up to `pr`. */
export const AERO_NO_FILE_LEVEL = 'pr'

/** autopilot.rs `load_policy_at` for a missing file: declared `off`, but `policy_level()` is `pr`. */
export function absentAeroAutopilotReading(): AeroAutopilotReading {
  return {
    fileExists: false,
    level: AERO_NO_FILE_LEVEL,
    declaredLevel: 'off',
    valid: true,
    errors: [],
    policy: defaultAeroAutopilotPolicy('off')
  }
}

/** A file that exists but cannot be used (unreadable, skipped, corrupt): fail closed to `off`. */
export function unusableAeroAutopilotReading(reason: string): AeroAutopilotReading {
  return {
    ...absentAeroAutopilotReading(),
    fileExists: true,
    level: 'off',
    valid: false,
    errors: [`autopilot.toml ${reason}. Autopilot stays off until it is fixed.`]
  }
}

/** autopilot.rs `load_policy_at` for a file that exists: corrupt or invalid never grants a level. */
export function parseAeroAutopilotPolicy(raw: string): AeroAutopilotReading {
  let document: unknown
  try {
    document = parseAeroToml(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return unusableAeroAutopilotReading(`does not parse (${message.trim().replace(/\n/g, ' ')})`)
  }
  const parsed = AeroAutopilotPolicySchema.safeParse(document)
  if (!parsed.success) {
    return unusableAeroAutopilotReading(
      `does not parse (${describeZodIssues(parsed.error).join('; ')})`
    )
  }
  const policy = normalizeAeroAutopilotPolicy(parsed.data)
  const errors = validateAeroAutopilotPolicy(policy)
  return {
    fileExists: true,
    level: errors.length === 0 ? policy.level : 'off',
    declaredLevel: policy.level,
    valid: errors.length === 0,
    errors,
    policy
  }
}
