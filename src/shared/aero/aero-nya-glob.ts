// The `glob` crate's `Pattern` with default options, which is what not-you-again matches scar scopes
// with: `*` and `?` cross `/`, `**` is only valid as a whole path component, `[` needs its `]`.

type GlobToken =
  | { kind: 'char'; value: string }
  | { kind: 'any-char' }
  | { kind: 'any-sequence' }
  | { kind: 'any-recursive' }
  | { kind: 'within'; specifiers: CharSpecifier[]; negated: boolean }

type CharSpecifier = { from: string; to: string }

export type AeroNyaGlob = { tokens: GlobToken[] }

const SEPARATOR = '/'

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
export function compileAeroNyaGlob(pattern: string): AeroNyaGlob | undefined {
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
      if (start !== 0 && chars[start - 1] !== SEPARATOR) {
        return undefined
      }
      if (index < chars.length) {
        if (chars[index] !== SEPARATOR) {
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
  return { tokens }
}

function inSpecifiers(specifiers: readonly CharSpecifier[], char: string): boolean {
  return specifiers.some((specifier) => char >= specifier.from && char <= specifier.to)
}

function matchesFrom(
  tokens: readonly GlobToken[],
  file: readonly string[],
  startPosition: number,
  startFollowsSeparator: boolean,
  startToken: number
): boolean {
  let position = startPosition
  let followsSeparator = startFollowsSeparator
  for (let tokenIndex = startToken; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex]
    if (token.kind === 'any-sequence' || token.kind === 'any-recursive') {
      if (matchesFrom(tokens, file, position, followsSeparator, tokenIndex + 1)) {
        return true
      }
      while (position < file.length) {
        const char = file[position]
        position += 1
        followsSeparator = char === SEPARATOR
        if (token.kind === 'any-recursive' && !followsSeparator) {
          continue
        }
        if (matchesFrom(tokens, file, position, followsSeparator, tokenIndex + 1)) {
          return true
        }
      }
      continue
    }
    if (position >= file.length) {
      return false
    }
    const char = file[position]
    position += 1
    const matched =
      token.kind === 'any-char' ||
      (token.kind === 'char' && token.value === char) ||
      (token.kind === 'within' && inSpecifiers(token.specifiers, char) !== token.negated)
    if (!matched) {
      return false
    }
    followsSeparator = char === SEPARATOR
  }
  return position >= file.length
}

export function matchesAeroNyaGlob(glob: AeroNyaGlob, path: string): boolean {
  return matchesFrom(glob.tokens, Array.from(path), 0, true, 0)
}

/** not-you-again's `scoped`: any scope of the scar matches any of the paths (`\` read as `/`). */
export function matchesAeroNyaScope(scope: readonly string[], paths: readonly string[]): boolean {
  const normalized = paths.map((path) => path.replaceAll('\\', '/'))
  return scope.some((pattern) => {
    const glob = compileAeroNyaGlob(pattern)
    return glob !== undefined && normalized.some((path) => matchesAeroNyaGlob(glob, path))
  })
}
