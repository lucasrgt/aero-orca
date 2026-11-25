import { describe, expect, it } from 'vitest'
import { parseAeroPipelineDef } from './aero-pipeline'

const def = (sensors: string): string =>
  `name = "bugfix"\n[[phase]]\nid = "red"\ntitle = "Red"\n${sensors}\n[[phase]]\nid = "green"\ntitle = "Green"\n`

describe('parseAeroPipelineDef sensor validation', () => {
  it('keeps a def with well formed proof sensors', () => {
    const result = parseAeroPipelineDef(
      def(
        '[[phase.sensor]]\nid = "t-red"\nexpect = "fail"\ncmd = "npm test"\n' +
          '[[phase.sensor]]\nid = "t-green"\nsame_cmd_as = "red.t-red"\n'
      ),
      'bugfix'
    )
    expect(result).toMatchObject({ ok: true, value: { name: 'bugfix', sensorCount: 2 } })
  })

  it('drops a def whose RED proof sensor is passive, naming the reason', () => {
    const result = parseAeroPipelineDef(
      def('[[phase.sensor]]\nid = "t-red"\nexpect = "fail"\ntool = "Bash"\n'),
      'bugfix'
    )
    expect(result).toEqual({
      ok: false,
      issues: [
        'pipeline def not loaded: sensor red/t-red: expect="fail"/same_cmd_as are active-only — drop `tool`/`match`'
      ]
    })
  })

  it('drops a def whose same_cmd_as is malformed or does not name an earlier RED sensor', () => {
    const malformed = parseAeroPipelineDef(
      def('[[phase.sensor]]\nid = "g"\nsame_cmd_as = "nodot"\n'),
      'x'
    )
    expect(!malformed.ok && malformed.issues[0]).toContain('must be "<phase>.<sensor>"')
    const later = parseAeroPipelineDef(
      def(
        '[[phase.sensor]]\nid = "g"\nsame_cmd_as = "red.r"\n[[phase.sensor]]\nid = "r"\nexpect = "fail"\n'
      ),
      'x'
    )
    expect(!later.ok && later.issues[0]).toContain('must name an EARLIER expect="fail" sensor')
  })

  it('falls back to the file stem for the name', () => {
    expect(parseAeroPipelineDef('description = "d"\n', 'stem')).toMatchObject({
      ok: true,
      value: { name: 'stem' }
    })
  })
})
