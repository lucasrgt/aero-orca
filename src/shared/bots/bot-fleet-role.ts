import * as z from 'zod'
import { normalizeBotProjectKey } from './bot-project-groups'

export const BOT_ROLES = ['admiral', 'captain'] as const
export type BotRole = (typeof BOT_ROLES)[number]

export const BotRoleSchema = z.enum(BOT_ROLES)

export const BOT_TERRITORY_MAX_LENGTH = 240
export const BotTerritorySchema = z
  .string()
  .trim()
  .max(BOT_TERRITORY_MAX_LENGTH)
  .refine((value) => !/\p{Cc}/u.test(value), 'Territory cannot contain control characters')

export function isBotRole(value: string): value is BotRole {
  return BOT_ROLES.some((role) => role === value)
}

/** Admirals sit at the top of their project group, followed by territory Captains, then standard bots. */
export function botRoleSortRank(role: BotRole | null | undefined): number {
  if (role === 'admiral') {
    return 0
  }
  if (role === 'captain') {
    return 1
  }
  return 2
}

export function botRoleDisplayLabel(role: BotRole | null | undefined): string {
  if (role === 'admiral') {
    return 'Admiral'
  }
  if (role === 'captain') {
    return 'Captain'
  }
  return 'Standard'
}

export type FleetBotSummary = {
  id?: string
  name: string
  project?: string | null
  role?: BotRole | null
  territory?: string | null
  paused?: boolean
}

function sameBot(a: FleetBotSummary, b: FleetBotSummary): boolean {
  if (a.id && b.id) {
    return a.id === b.id
  }
  return a.name.toLowerCase() === b.name.toLowerCase()
}

function formatBotAddress(name: string): string {
  const address = `bot:${name}`
  return /^[\w.@-]+$/u.test(name) ? address : `"${address.replace(/(["\\$`])/g, '\\$1')}"`
}

function formatPeerBullet(peer: FleetBotSummary): string {
  const scope = peer.territory?.trim() ? ` — ${peer.territory.trim()}` : ''
  const paused = peer.paused ? ' (paused)' : ''
  return `- **${peer.name}** (\`${formatBotAddress(peer.name)}\`)${scope}${paused}`
}

/** Live fleet hierarchy context injected into Admiral and Captain bot preambles. */
export function buildBotFleetSection(
  bot: FleetBotSummary,
  allBots: readonly FleetBotSummary[],
  orcaCli: string
): string | null {
  if (!bot.role) {
    return null
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  const projectKey = normalizeBotProjectKey(bot.project)
  const others = allBots
    .filter((candidate) => !sameBot(candidate, bot))
    .sort((a, b) => collator.compare(a.name, b.name))

  if (bot.role === 'admiral') {
    if (projectKey && bot.project?.trim()) {
      const captains = others.filter(
        (candidate) =>
          candidate.role === 'captain' && normalizeBotProjectKey(candidate.project) === projectKey
      )
      const list =
        captains.length > 0
          ? captains.map(formatPeerBullet).join('\n')
          : '- (No territory captains assigned to this project yet.)'
      return [
        `## Fleet Role: Admiral (${bot.project.trim()})`,
        '',
        `You are the **Admiral** for **${bot.project.trim()}**. You hold the project's goals, break down requests that span territories, and route territory work to the matching Captain instead of editing a Captain's territory yourself.`,
        '',
        '### Territory Captains in this project',
        list,
        '',
        `Delegate territory work with \`${orcaCli} orchestration send --to bot:<name> --type handoff --subject "<task>" --body "<goal, bounds, and how to verify>"\`. Use \`--type question\` when you only need input from a Captain, and keep your owner briefed on cross-territory progress, decisions, and risks.`
      ].join('\n')
    }

    const admirals = others.filter((candidate) => candidate.role === 'admiral')
    const standaloneCaptains = others.filter(
      (candidate) =>
        candidate.role === 'captain' &&
        !admirals.some(
          (admiral) =>
            normalizeBotProjectKey(admiral.project) !== null &&
            normalizeBotProjectKey(admiral.project) === normalizeBotProjectKey(candidate.project)
        )
    )
    const fleetLines = [
      ...admirals.map((admiral) => {
        const proj = admiral.project?.trim() ? ` [${admiral.project.trim()}]` : ''
        return `- **${admiral.name}**${proj} (\`${formatBotAddress(admiral.name)}\`) — Project Admiral${admiral.paused ? ' (paused)' : ''}`
      }),
      ...standaloneCaptains.map((captain) => {
        const proj = captain.project?.trim() ? ` [${captain.project.trim()}]` : ''
        const scope = captain.territory?.trim() ? ` — ${captain.territory.trim()}` : ''
        return `- **${captain.name}**${proj} (\`${formatBotAddress(captain.name)}\`)${scope}${captain.paused ? ' (paused)' : ''}`
      })
    ]
    return [
      '## Fleet Role: Fleet Admiral',
      '',
      'You are the **Fleet Admiral** across projects. Hold the owner’s priorities across projects, decide which project a request belongs to, and route it to that project’s Admiral (or Captain) via `handoff`.',
      '',
      '### Active Fleet',
      fleetLines.length > 0 ? fleetLines.join('\n') : '- (No Admirals or Captains registered yet.)',
      '',
      `Route project work with \`${orcaCli} orchestration send --to bot:<name> --type handoff --subject "<task>" --body "<owner's request and done criteria>"\`.`
    ].join('\n')
  }

  // Territory Captain
  const sameProject = projectKey
    ? others.filter((candidate) => normalizeBotProjectKey(candidate.project) === projectKey)
    : []
  const admiral = sameProject.find((candidate) => candidate.role === 'admiral') ?? null
  const siblings = sameProject.filter((candidate) => candidate.role === 'captain')
  const lines = [
    `## Fleet Role: Territory Captain${bot.project?.trim() ? ` (${bot.project.trim()})` : ''}`,
    '',
    bot.territory?.trim()
      ? `**Your territory:** ${bot.territory.trim()}`
      : 'You own a dedicated territory of this project.',
    '',
    'Own work inside your territory end-to-end: keep `MEMORY.md` warm with key files, pitfalls, and verification commands, and verify results before reporting done.',
    '',
    '### Warm worker slot policy',
    `- Maintain **one primary warm worker slot** in your territory so prompt cache stays hot even for small tasks. When Orca reports a warm idle slot (\`[Orca warm slot: ...]\`), **reuse it** via \`${orcaCli} orchestration send --to dispatch:<id> --body "..."\` instead of opening a fresh worktree.`,
    '- Open a **second parallel worker slot** (`--worktree new-child`) only when the primary slot is busy with an independent task or when a separate branch/PR is explicitly needed.',
    '- When Orca flags **RECYCLE RECOMMENDED** (context nearing saturation), ask the worker for a brief handoff summary, save durable territory learnings into `MEMORY.md`, and start a fresh slot for the next task.'
  ]
  if (admiral) {
    lines.push(
      '',
      `**Project Admiral:** **${admiral.name}** (\`${formatBotAddress(admiral.name)}\`) — escalate scope/product decisions or cross-territory work here.`
    )
  }
  if (siblings.length > 0) {
    lines.push(
      '',
      '### Sibling Territory Captains (stay within your boundaries; ask or hand off when work belongs there)',
      ...siblings.map(formatPeerBullet)
    )
  }
  return lines.join('\n')
}
