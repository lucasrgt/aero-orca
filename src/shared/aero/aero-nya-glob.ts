// The `glob` crate's `Pattern` with default options, which is what not-you-again matches scar scopes
// with: `*` and `?` cross `/`, `**` is only valid as a whole path component, `[` needs its `]`.

type GlobToken =
  | { kind: 'char'; value: string }
  | { kind: 'any-char' }
  | { kind: 'any-sequence' }
  | { kind: 'any-recursive' }
  | { kind: 'within'; specifiers: CharSpecifier[]; negated: boolean }

type CharSpecifier = { from: string; to: string }

/** `windows` is the crate's `cfg!(windows)`: `\` is then a path separator and equals `/` in a literal. */
export type AeroNyaGlob = { tokens: GlobToken[]; windows: boolean }

function isSeparator(char: string, windows: boolean): boolean {
  return char === '/' || (windows && char === '\\')
}

function isWindows(platform: string): boolean {
  return platform === 'win32'
}

function parseCharSpecifiers(chars: readonly string[]): CharSpecifier[] {
  const specifiers: CharSpecifier[] = []
  for (let index = 0; index < chars.length;) {
    if (index + 3 <= chars.length && chars[index + 1] === '-') {
      specifiers.push({ from: chars[index], to: chars[index + 2] })
      index += 3
    } else {
      specifiers.push({ from: chars[index], to: chars[index] })
      index += 1
    }
  }
  return specifiers
}

function indexOfClosingBracket(chars: readonly string[], from: number): number {
  for (let index = from; index < chars.length; index += 1) {
    if (chars[index] === ']') {
      return index
    }
  }
  return -1
}

/** A `[...]` class starting at `index`: its token and the index after it, or null when it never closes. */
function parseCharClass(
  chars: readonly string[],
  index: number
): { token: GlobToken; next: number } | null {
  if (index + 4 <= chars.length && chars[index + 1] === '!') {
    const close = indexOfClosingBracket(chars, index + 3)
    if (close !== -1) {
      const specifiers = parseCharSpecifiers(chars.slice(index + 2, close))
      return { token: { kind: 'within', specifiers, negated: true }, next: close + 1 }
    }
  } else if (index + 3 <= chars.length && chars[index + 1] !== '!') {
    const close = indexOfClosingBracket(chars, index + 2)
    if (close !== -1) {
      const specifiers = parseCharSpecifiers(chars.slice(index + 1, close))
      return { token: { kind: 'within', specifiers, negated: false }, next: close + 1 }
    }
  }
  return null
}

/** Compiles a pattern; undefined is the crate's `PatternError` (a scope that can never be valid). */
export function compileAeroNyaGlob(
  pattern: string,
  platform: string = process.platform
): AeroNyaGlob | undefined {
  const windows = isWindows(platform)
  const chars = Array.from(pattern)
  const tokens: GlobToken[] = []
  let index = 0
  while (index < chars.length) {
    const char = chars[index]
    if (char === '?') {
      tokens.push({ kind: 'any-char' })
      index += 1
    } else if (char === '[') {
      const parsed = parseCharClass(chars, index)
      if (parsed === null) {
        return undefined
      }
      tokens.push(parsed.token)
      index = parsed.next
    } else if (char === '*') {
      const start = index
      while (index < chars.length && chars[index] === '*') {
        index += 1
      }
      const count = index - start
      if (count > 2) {
        return undefined
      }
      if (count === 1) {
        tokens.push({ kind: 'any-sequence' })
        continue
      }
      // `**` must be a whole component: at the start or after `/`, and before `/` or at the end.
      if (start !== 0 && !isSeparator(chars[start - 1], windows)) {
        return undefined
      }
      if (index < chars.length) {
        if (!isSeparator(chars[index], windows)) {
          return undefined
        }
        index += 1
      }
      if (!(tokens.length > 1 && tokens.at(-1)?.kind === 'any-recursive')) {
        tokens.push({ kind: 'any-recursive' })
      }
    } else {
      tokens.push({ kind: 'char', value: char })
      index += 1
    }
  }
  return { tokens, windows }
}

function inSpecifiers(specifiers: readonly CharSpecifier[], char: string): boolean {
  return specifiers.some((specifier) => char >= specifier.from && char <= specifier.to)
}

// The crate's MatchResult: a sub-pattern miss lets the caller try another split, while an entire
// miss (the path ran out before a literal or class token) ends every enclosing `*` loop at once.
type MatchResult = 'match' | 'sub-pattern-misses' | 'entire-pattern-misses'

type Matcher = { glob: AeroNyaGlob; file: readonly string[] }

function tokenMatches(token: GlobToken, char: string, windows: boolean): boolean {
  if (token.kind === 'any-char') {
    return true
  }
  if (token.kind === 'within') {
    return inSpecifiers(token.specifiers, char) !== token.negated
  }
  if (token.kind !== 'char') {
    return false
  }
  return token.value === char || (isSeparator(token.value, windows) && isSeparator(char, windows))
}

function matchesFrom(matcher: Matcher, startPosition: number, startToken: number): MatchResult {
  const { glob, file } = matcher
  let position = startPosition
  for (let tokenIndex = startToken; tokenIndex < glob.tokens.length; tokenIndex += 1) {
    const token = glob.tokens[tokenIndex]
    if (token.kind === 'any-sequence' || token.kind === 'any-recursive') {
      const empty = matchesFrom(matcher, position, tokenIndex + 1)
      if (empty !== 'sub-pattern-misses') {
        return empty
      }
      while (position < file.length) {
        const separator = isSeparator(file[position], glob.windows)
        position += 1
        if (token.kind === 'any-recursive' && !separator) {
          continue
        }
        const rest = matchesFrom(matcher, position, tokenIndex + 1)
        if (rest !== 'sub-pattern-misses') {
          return rest
        }
      }
      continue
    }
    if (position >= file.length) {
      return 'entire-pattern-misses'
    }
    const char = file[position]
    position += 1
    if (!tokenMatches(token, char, glob.windows)) {
      return 'sub-pattern-misses'
    }
  }
  return position >= file.length ? 'match' : 'sub-pattern-misses'
}

export function matchesAeroNyaGlob(glob: AeroNyaGlob, path: string): boolean {
  return matchesFrom({ glob, file: Array.from(path) }, 0, 0) === 'match'
}

/** not-you-again's `scoped`: any scope of the scar matches any of the paths (`\` read as `/`). */
export function matchesAeroNyaScope(
  scope: readonly string[],
  paths: readonly string[],
  platform: string = process.platform
): boolean {
  const normalized = paths.map((path) => path.replaceAll('\\', '/'))
  return scope.some((pattern) => {
    const glob = compileAeroNyaGlob(pattern, platform)
    return glob !== undefined && normalized.some((path) => matchesAeroNyaGlob(glob, path))
  })
}
