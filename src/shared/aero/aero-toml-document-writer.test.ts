import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAeroToml } from './aero-toml-integers'
import {
  isAeroTomlTable,
  renderAeroTomlDocument,
  renderTomlEditString
} from './aero-toml-document-writer'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

// The real boards are trimmed copies of AeroFortress's own files; the synthetic ones were written by
// the app's real serializer (toml 0.8.2) over every table type and the awkward strings.
const BOARDS = [
  'kanban-real-autopilot-trimmed.toml',
  'kanban-real-autonomy-trimmed.toml',
  'kanban-rust-synthetic.toml',
  'kanban-rust-empty.toml'
]

describe('renderAeroTomlDocument', () => {
  it.each(BOARDS)('writes %s back byte for byte', (name) => {
    const raw = fixture(name)
    const tree = parseAeroToml(raw)
    expect(isAeroTomlTable(tree) ? renderAeroTomlDocument(tree) : null).toBe(raw)
  })
})

describe('renderTomlEditString', () => {
  it.each([
    ['plain', '"plain"'],
    ['say "hi"', '"say \\"hi\\""'],
    ['one\ntwo', '"""\none\ntwo"""'],
    ['one\n"two"', '"""\none\n\\"two\\""""'],
    ['C:\\temp', "'C:\\temp'"],
    ["C:\\it's", "'''C:\\it's'''"],
    ['a\\b\nc', "'''\na\\b\nc'''"],
    ['tab\there', '"tab\\there"'],
    ['bell\u0007', '"bell\\u0007"'],
    ["x'''y\\", "\"x'''y\\\\\""]
  ])('writes %j the way toml_edit 0.20 does', (value, expected) => {
    expect(renderTomlEditString(value)).toBe(expected)
  })
})
