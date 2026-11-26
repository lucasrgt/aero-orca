import { describe, expect, it } from 'vitest'
import {
  buildAeroNyaNewFilePatch,
  changedAeroNyaChunk,
  chunkAeroNyaDiff,
  parseAeroNyaNameStatus
} from './aero-nya-diff-chunks'

describe('buildAeroNyaNewFilePatch', () => {
  it('writes a new-file patch with every line added', () => {
    expect(buildAeroNyaNewFilePatch('src/new.ts', 'one\r\ntwo\n')).toBe(
      '\ndiff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,2 @@\n+one\n+two\n'
    )
  })

  it('writes an empty file as a hunk of no lines', () => {
    expect(buildAeroNyaNewFilePatch('a.txt', '')).toContain('@@ -0,0 +1,0 @@\n')
  })
})

describe('parseAeroNyaNameStatus', () => {
  it('lists every path once, a rename or copy giving both of its paths', () => {
    const output = [
      'M',
      'src/a.ts',
      'R100',
      'old.ts',
      'new.ts',
      'C75',
      'src/a.ts',
      'copy.ts',
      'A',
      'new.ts',
      ''
    ].join('\0')
    expect(parseAeroNyaNameStatus(output)).toEqual(['src/a.ts', 'old.ts', 'new.ts', 'copy.ts'])
  })

  it('reads an empty diff as no paths and rejects a status with no path', () => {
    expect(parseAeroNyaNameStatus('')).toEqual([])
    expect(() => parseAeroNyaNameStatus('M\0')).toThrow('git returned a status without a path')
    expect(() => parseAeroNyaNameStatus('R100\0old.ts\0')).toThrow(
      'git returned a rename without a destination'
    )
  })
})

describe('changedAeroNyaChunk', () => {
  const body = [
    'diff --git a/src/a.tsx b/src/a.tsx',
    '+tsx',
    'diff --git a/src/a.ts b/src/a.ts',
    '+ts',
    'diff --git "a/with space.ts" "b/with space.ts"',
    '+spaced',
    'diff --git a/old.ts b/new.ts',
    '+renamed'
  ].join('\n')

  it('returns the patch of the exact path, never of a longer one it prefixes', () => {
    expect(changedAeroNyaChunk(body, 'src/a.ts')).toContain('+ts')
    expect(changedAeroNyaChunk(body, 'src/a.ts')).not.toContain('+tsx')
    expect(changedAeroNyaChunk(body, 'src/a.tsx')).toContain('+tsx')
  })

  it('finds a quoted path with a space and either side of a rename', () => {
    expect(changedAeroNyaChunk(body, 'with space.ts')).toContain('+spaced')
    expect(changedAeroNyaChunk(body, 'old.ts')).toContain('+renamed')
    expect(changedAeroNyaChunk(body, 'new.ts')).toContain('+renamed')
  })

  it('is empty for a path the diff does not touch', () => {
    expect(changedAeroNyaChunk(body, 'a.ts')).toBe('')
    expect(changedAeroNyaChunk(body, 'missing.ts')).toBe('')
  })
})

describe('chunkAeroNyaDiff', () => {
  it('has no window for an empty patch', () => {
    expect(chunkAeroNyaDiff('')).toEqual([])
  })

  it('keeps a short patch whole and overlaps the windows of a long one by 2,000 characters', () => {
    expect(chunkAeroNyaDiff('short')).toEqual(['short'])
    const long = 'x'.repeat(100_000)
    const windows = chunkAeroNyaDiff(long)
    expect(windows.map((window) => window.length)).toEqual([80_000, 22_000])
  })

  it('counts characters, not UTF-16 units', () => {
    const windows = chunkAeroNyaDiff('😀'.repeat(79_000))
    expect(windows.map((window) => Array.from(window).length)).toEqual([79_000, 1000])
  })
})
