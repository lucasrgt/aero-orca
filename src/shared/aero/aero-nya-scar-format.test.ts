import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAeroNyaScar } from './aero-nya'
import { aeroNyaScarToJson, renderAeroNyaScarToml } from './aero-nya-scar-format'
import { makeAeroNyaScar } from './aero-nya-test-scars'
import { renderTomlString, renderTomlStringArray } from './aero-toml-string-writer'

// Scars as not-you-again wrote them (`toml::to_string_pretty`), scrubbed of personal data.
const FIXTURES = [
  'nya-scar-basic-multiline-arrays.toml',
  'nya-scar-literal-lesson.toml',
  'nya-scar-multiline-literal.toml',
  'nya-scar-multiline-basic.toml',
  'nya-scar-five-occurrences.toml'
]

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8').replaceAll('\r\n', '\n')

describe('renderAeroNyaScarToml', () => {
  it.each(FIXTURES)('writes %s byte for byte as the Rust serializer did', (name) => {
    const raw = fixture(name)
    const parsed = parseAeroNyaScar(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && renderAeroNyaScarToml(parsed.value)).toBe(raw)
  })

  it('writes a new scar with inline single-scope arrays and empty arrays', () => {
    const scar = makeAeroNyaScar({
      id: 'NYA-01KYASTB1H12GS04SVR3CNF2M9',
      title: 'A title',
      lesson: 'A lesson.',
      scope: ['src/**'],
      tags: []
    })
    expect(renderAeroNyaScarToml(scar)).toBe(
      [
        'schema = 1',
        'id = "NYA-01KYASTB1H12GS04SVR3CNF2M9"',
        'title = "A title"',
        'lesson = "A lesson."',
        'scope = ["src/**"]',
        'tags = []',
        'created_at = "2026-07-24T19:32:13Z"',
        '',
        '[[occurrences]]',
        'occurred_at = "2026-07-24T19:32:13Z"',
        'corrected_by = "git:dev@example.com"',
        'recorded_by = "git:dev@example.com"',
        'commit = "abc1234"',
        ''
      ].join('\n')
    )
  })

  it('reads back what it writes', () => {
    const scar = makeAeroNyaScar({
      id: 'NYA-01KYASTB1H12GS04SVR3CNF2M9',
      title: 'Quotes "and" \'both\'',
      lesson: 'Line one\nLine two with a \\ backslash and "quotes"',
      scope: ['src/**', '**/*.ts'],
      tags: ['a', 'b']
    })
    expect(parseAeroNyaScar(renderAeroNyaScarToml(scar))).toEqual({ ok: true, value: scar })
  })
})

describe('renderTomlString', () => {
  it.each([
    ['plain', '"plain"'],
    ['with "dq"', '\'with "dq"\''],
    ['both "d" and \'s\'', '"""both "d" and \'s\'"""'],
    ['back\\slash', "'back\\slash'"],
    ['tab\there', '"tab\\there"'],
    ['nl\nhere', '"""\nnl\nhere"""'],
    ['a\\b\nc', "'''\na\\b\nc'''"],
    ['cr\rhere', '"cr\\rhere"'],
    ['bell\u0007x', '"bell\\u0007x"'],
    ['del\u007fx', '"del\\u007Fx"'],
    ['ünï → ✓', '"ünï → ✓"'],
    ['', '""']
  ])('writes %j as %s', (value, expected) => {
    expect(renderTomlString(value)).toBe(expected)
  })
})

describe('renderTomlStringArray', () => {
  it('is inline up to one element and one element per line from two', () => {
    expect(renderTomlStringArray([])).toBe('[]')
    expect(renderTomlStringArray(['a'])).toBe('["a"]')
    expect(renderTomlStringArray(['a', 'b'])).toBe('[\n    "a",\n    "b",\n]')
  })
})

describe('aeroNyaScarToJson', () => {
  it('keeps declaration order and writes a missing occurrence field as null, like serde_json', () => {
    const json = aeroNyaScarToJson(makeAeroNyaScar({ id: 'NYA-1' }))
    expect(Object.keys(json)).toEqual([
      'schema',
      'id',
      'title',
      'lesson',
      'scope',
      'tags',
      'created_at',
      'occurrences'
    ])
    expect(json.occurrences).toEqual([
      {
        occurred_at: '2026-07-24T19:32:13Z',
        source: null,
        reported_by: null,
        corrected_by: 'git:dev@example.com',
        recorded_by: 'git:dev@example.com',
        recorded_for: null,
        commit: 'abc1234'
      }
    ])
  })
})
