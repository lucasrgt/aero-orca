import type { AeroNyaScar } from './aero-nya'

/** A valid scar with synthetic content; override any field. Never real repo data. */
export function makeAeroNyaScar(fields: Partial<AeroNyaScar> & { id: string }): AeroNyaScar {
  return {
    schema: 1,
    title: `Scar ${fields.id}`,
    lesson: 'A reusable lesson about a corrected failure.',
    scope: ['**'],
    tags: [],
    created_at: '2026-07-24T19:32:13Z',
    occurrences: [
      {
        occurred_at: '2026-07-24T19:32:13Z',
        corrected_by: 'git:dev@example.com',
        recorded_by: 'git:dev@example.com',
        commit: 'abc1234'
      }
    ],
    ...fields
  }
}
