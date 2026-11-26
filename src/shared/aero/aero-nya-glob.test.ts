import { describe, expect, it } from 'vitest'
import { compileAeroNyaGlob, matchesAeroNyaGlob, matchesAeroNyaScope } from './aero-nya-glob'

const PATHS = [
  'src-tauri/src/codex.rs',
  'src-tauri/src/a/b.rs',
  'src-tauri/src/',
  'src-tauri/src',
  'src-tauri/srcx/a',
  'src/App.tsx',
  'src/App.tsx.bak',
  'x.ts',
  'a/b/x.ts',
  'a/b',
  'a/x/b',
  'a/x/y/b',
  'a',
  '',
  'src-tauri/src/m/mod.rs',
  'src-tauri/mod.rs',
  '.github/workflows/ci.yml',
  'src/a/b.ts',
  'src/a.ts'
]

// Expected matches come from running the `glob` 0.3.4 crate's `Pattern::matches`, which is what
// not-you-again uses; they were not derived from this implementation.
const CRATE_TRUTH: [string, string[]][] = [
  [
    'src-tauri/src/**',
    ['src-tauri/src/codex.rs', 'src-tauri/src/a/b.rs', 'src-tauri/src/', 'src-tauri/src/m/mod.rs']
  ],
  ['src/App.tsx', ['src/App.tsx']],
  [
    '*.rs',
    ['src-tauri/src/codex.rs', 'src-tauri/src/a/b.rs', 'src-tauri/src/m/mod.rs', 'src-tauri/mod.rs']
  ],
  ['src/**/*.ts', ['src/a/b.ts', 'src/a.ts']],
  ['**/x.ts', ['x.ts', 'a/b/x.ts']],
  ['src-tauri/**/mod.rs', ['src-tauri/src/m/mod.rs', 'src-tauri/mod.rs']],
  ['.github/workflows/**', ['.github/workflows/ci.yml']],
  ['a/**/b', ['a/b', 'a/x/b', 'a/x/y/b']],
  ['a/**', ['a/b/x.ts', 'a/b', 'a/x/b', 'a/x/y/b']],
  ['src/*', ['src/App.tsx', 'src/App.tsx.bak', 'src/a/b.ts', 'src/a.ts']]
]

describe('compileAeroNyaGlob', () => {
  it.each(CRATE_TRUTH)('matches %s like the glob crate', (pattern, expected) => {
    const glob = compileAeroNyaGlob(pattern)
    expect(glob).toBeDefined()
    expect(PATHS.filter((path) => glob && matchesAeroNyaGlob(glob, path))).toEqual(expected)
  })

  it('matches every path, even the empty one, with the global scope **', () => {
    const glob = compileAeroNyaGlob('**')
    expect(PATHS.every((path) => glob && matchesAeroNyaGlob(glob, path))).toBe(true)
  })

  it('crosses a slash with * and ?, which the crate does by default', () => {
    expect(matchesAeroNyaGlob(compileAeroNyaGlob('a?c')!, 'a/c')).toBe(true)
    expect(matchesAeroNyaGlob(compileAeroNyaGlob('a*b*c')!, 'aXbYc')).toBe(true)
  })

  it('reads character classes and their negation', () => {
    const within = compileAeroNyaGlob('[a-c]x')!
    expect(['ax', 'bx', 'dx'].filter((path) => matchesAeroNyaGlob(within, path))).toEqual([
      'ax',
      'bx'
    ])
    const negated = compileAeroNyaGlob('[!a-c]x')!
    expect(['ax', 'dx', ']x'].filter((path) => matchesAeroNyaGlob(negated, path))).toEqual([
      'dx',
      ']x'
    ])
  })

  it.each(['a**', '***', '[abc', 'a/**b'])(
    'rejects the pattern %s the crate rejects',
    (pattern) => {
      expect(compileAeroNyaGlob(pattern)).toBeUndefined()
    }
  )
})

describe('matching cost', () => {
  it('rejects an adversarial scope fast, because an entire miss ends every * loop', () => {
    const glob = compileAeroNyaGlob(`${'*e'.repeat(12)}*Z`)!
    const started = performance.now()
    expect(matchesAeroNyaGlob(glob, `src/${'e'.repeat(40)}.ts`)).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('Windows separators of the glob crate', () => {
  it('reads a backslash as a separator for ** and as equal to / in a literal on win32', () => {
    const glob = compileAeroNyaGlob('src\\**\\*.rs', 'win32')
    expect(glob).toBeDefined()
    expect(matchesAeroNyaGlob(glob!, 'src/a/b.rs')).toBe(true)
    expect(matchesAeroNyaGlob(glob!, 'src/b.rs')).toBe(true)
    expect(matchesAeroNyaGlob(glob!, 'lib/b.rs')).toBe(false)
    expect(matchesAeroNyaScope(['src\\**\\*.rs'], ['src\\a\\b.rs'], 'win32')).toBe(true)
  })

  it('keeps a backslash an ordinary character elsewhere, so the same scope is invalid there', () => {
    expect(compileAeroNyaGlob('src\\**\\*.rs', 'linux')).toBeUndefined()
    expect(matchesAeroNyaGlob(compileAeroNyaGlob('a\\b', 'linux')!, 'a/b')).toBe(false)
  })
})

describe('matchesAeroNyaScope', () => {
  it('matches a scar scope against any expected path, reading backslashes as slashes', () => {
    const scope = ['src-tauri/src/**', 'src/App.tsx']
    expect(matchesAeroNyaScope(scope, ['src-tauri\\src\\codex.rs'])).toBe(true)
    expect(matchesAeroNyaScope(scope, ['docs/readme.md', 'src/App.tsx'])).toBe(true)
    expect(matchesAeroNyaScope(scope, ['docs/readme.md'])).toBe(false)
    expect(matchesAeroNyaScope(scope, [])).toBe(false)
  })

  it('ignores a scope that is not a valid pattern instead of throwing', () => {
    expect(matchesAeroNyaScope(['a**'], ['a'])).toBe(false)
  })
})
