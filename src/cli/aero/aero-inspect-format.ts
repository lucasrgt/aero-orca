import type { AeroSnapshotSummary } from '../../shared/aero/aero-workspace-snapshot'

const MAX_LISTED_ISSUES = 20

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function formatAeroSnapshotSummary(summary: AeroSnapshotSummary): string {
  const { counts, autopilot } = summary
  const lines = [`AeroFortress artifacts in ${summary.repoPath}`]
  if (!summary.found.aerofortress && !summary.found.nya) {
    lines.push('  No .aerofortress/ or .nya/ folder found.')
    return lines.join('\n')
  }
  lines.push(
    `  Knowledge: ${plural(counts.items, 'item')} in ${plural(counts.cells, 'cell')} ` +
      `(${counts.digests} digests, ${counts.constitution} constitution, ${counts.staleItems} stale, ${counts.replacedItems} replaced)`,
    `  Boards: ${plural(counts.boards, 'board')}, ${plural(counts.cards, 'card')}`
  )
  for (const board of summary.boards) {
    lines.push(
      `    ${board.name} [${board.mode}]: ${plural(board.columns, 'column')}, ${plural(board.cards, 'card')}`
    )
  }
  const policy = autopilot.fileExists
    ? `${autopilot.level}${autopilot.valid ? '' : ' (policy invalid, fails closed)'}`
    : 'pr (no autopilot.toml; the repo sets no ceiling)'
  lines.push(`  Autopilot level: ${policy}`)
  lines.push(`  Routines: ${plural(counts.routines, 'routine')}`)
  for (const routine of summary.routines) {
    const schedule = routine.schedule === '' ? 'manual' : routine.schedule
    lines.push(
      `    ${routine.name}: ${schedule}${routine.understood || !routine.schedule ? '' : ' (not understood)'}`
    )
  }
  lines.push(
    `  Loops: ${counts.loops}, agents: ${counts.agents}, specs: ${counts.specs}, pipeline defs: ${counts.pipelineDefs}`,
    `  Not You Again: ${plural(counts.scars, 'scar')}`,
    `  Issues: ${counts.issues}`
  )
  for (const issue of summary.issues.slice(0, MAX_LISTED_ISSUES)) {
    lines.push(`    ${issue.path}: ${issue.reason}`)
  }
  if (summary.issues.length > MAX_LISTED_ISSUES) {
    lines.push(`    ... and ${summary.issues.length - MAX_LISTED_ISSUES} more (use --json)`)
  }
  return lines.join('\n')
}
