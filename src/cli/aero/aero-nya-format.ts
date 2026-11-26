import type { AeroNyaScar } from '../../shared/aero/aero-nya'
import type { AeroNyaCheckResult } from '../../shared/aero/aero-nya-check-audit'

function describeScar(scar: AeroNyaScar): string {
  const recurrences = scar.occurrences.length
  return [
    `${scar.id}  ${scar.title}  (${recurrences} occurrence${recurrences === 1 ? '' : 's'})`,
    `  scope: ${scar.scope.join(', ')}`,
    ...(scar.tags.length > 0 ? [`  tags: ${scar.tags.join(', ')}`] : []),
    `  lesson: ${scar.lesson}`
  ].join('\n')
}

export function formatAeroNyaRecall(scars: readonly AeroNyaScar[]): string {
  if (scars.length === 0) {
    return 'No scar is relevant to this task and these paths.'
  }
  return [
    `${scars.length} scar${scars.length === 1 ? '' : 's'} recalled`,
    ...scars.map(describeScar)
  ].join('\n\n')
}

export function formatAeroNyaRemember(scar: AeroNyaScar): string {
  return `Recorded ${scar.id} (${scar.occurrences.length} occurrence${scar.occurrences.length === 1 ? '' : 's'}): ${scar.title}`
}

export function formatAeroNyaCheck(result: AeroNyaCheckResult): string {
  const scope = `${result.scars_checked} scar${result.scars_checked === 1 ? '' : 's'} checked`
  if (result.passed) {
    return `Recurrence check passed (${scope}).`
  }
  const findings = result.findings.map(
    (finding) =>
      `${finding.path}:${finding.line}  ${finding.scar_id}\n  evidence: ${finding.evidence}\n  reason: ${finding.reason}`
  )
  return [
    `Recurrence check failed (${scope}); ${result.findings.length} recurrence(s):`,
    ...findings
  ].join('\n\n')
}
