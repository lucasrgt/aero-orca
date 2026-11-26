// Writes a parsed TOML tree the way AeroFortress's Rust `toml` 0.8 (toml_edit 0.20) `to_string`
// does: bare keys, inline arrays, `[[x]]` for non-empty arrays of tables, values before sub-tables,
// strings per toml_edit's `infer_style`. A board written here is byte-for-byte what Aero writes.

export type AeroTomlValue = string | boolean | bigint | number | AeroTomlValue[] | AeroTomlTable
export type AeroTomlTable = { [key: string]: AeroTomlValue }

export function isAeroTomlTable(value: unknown): value is AeroTomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTableArray(value: AeroTomlValue): value is AeroTomlTable[] {
  return Array.isArray(value) && value.length > 0 && value.every(isAeroTomlTable)
}

/** Whether a value is written as a `[x]`/`[[x]]` section after the plain values, not as `x = ...`. */
export function isAeroTomlSection(value: AeroTomlValue): boolean {
  return isAeroTomlTable(value) || isTableArray(value)
}

function isControl(code: number): boolean {
  return code <= 0x1f || code === 0x7f
}

type StringStyle = { multiline: boolean; literal: boolean; tripleLiteral: boolean }

/** toml_edit `infer_style`: literal only when a backslash asks for it and nothing needs escaping. */
function inferStringStyle(value: string): StringStyle {
  let multiline = false
  let singles = 0
  let maxSingles = 0
  let preferLiteral = false
  let canBePretty = true
  for (const char of value) {
    if (!canBePretty) {
      multiline ||= char === '\n'
      continue
    }
    if (char === "'") {
      singles += 1
      canBePretty = singles < 3
    } else {
      maxSingles = Math.max(maxSingles, singles)
      singles = 0
    }
    const code = char.codePointAt(0) ?? 0
    if (char === '\\') {
      preferLiteral = true
    } else if (char === '\n') {
      multiline = true
    } else if (char !== '\t' && isControl(code)) {
      canBePretty = false
    }
  }
  if (singles > 0 && value.endsWith("'")) {
    canBePretty = false
  }
  if (!preferLiteral || !canBePretty) {
    return { multiline, literal: false, tripleLiteral: false }
  }
  maxSingles = Math.max(maxSingles, singles)
  return { multiline, literal: true, tripleLiteral: !multiline && maxSingles >= 1 }
}

const BASIC_ESCAPES = new Map<string, string>([
  ['\b', '\\b'],
  ['\t', '\\t'],
  ['\f', '\\f'],
  ['\r', '\\r'],
  ['"', '\\"'],
  ['\\', '\\\\']
])

function escapeBasic(value: string, multiline: boolean): string {
  let output = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const escape = BASIC_ESCAPES.get(char)
    if (escape !== undefined) {
      output += escape
    } else if (char === '\n') {
      output += multiline ? '\n' : '\\n'
    } else if (isControl(code)) {
      output += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      output += char
    }
  }
  return output
}

/** A TOML string value exactly as toml_edit 0.20 writes it. */
export function renderTomlEditString(value: string): string {
  const style = inferStringStyle(value)
  if (style.literal) {
    if (style.multiline) {
      return `'''\n${value}'''`
    }
    return style.tripleLiteral ? `'''${value}'''` : `'${value}'`
  }
  return style.multiline ? `"""\n${escapeBasic(value, true)}"""` : `"${escapeBasic(value, false)}"`
}

function renderKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${escapeBasic(key, false)}"`
}

/** Rust prints an `f64` without an exponent; JS switches to one at the extremes, so expand it. */
function expandExponent(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text)
  if (!match) {
    return text
  }
  const [, sign, whole, fraction = '', exponent] = match
  const digits = whole + fraction
  const point = whole.length + Number(exponent)
  if (point <= 0) {
    return `${sign}0.${'0'.repeat(-point)}${digits}`
  }
  if (point >= digits.length) {
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

function renderFloat(value: number): string {
  if (Number.isNaN(value)) {
    return 'nan'
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'inf' : '-inf'
  }
  if (value === 0) {
    return Object.is(value, -0) ? '-0.0' : '0.0'
  }
  const text = expandExponent(String(value))
  return text.includes('.') ? text : `${text}.0`
}

function renderInline(value: AeroTomlValue): string {
  if (typeof value === 'string') {
    return renderTomlEditString(value)
  }
  if (typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'number') {
    return renderFloat(value)
  }
  if (Array.isArray(value)) {
    if (value.some(isAeroTomlTable)) {
      throw new Error('an array mixing tables and values cannot be written')
    }
    return `[${value.map(renderInline).join(', ')}]`
  }
  throw new Error('an inline table cannot be written')
}

type LayoutState = { output: string; firstTable: boolean }

function writeTable(
  state: LayoutState,
  table: AeroTomlTable,
  path: readonly string[],
  arrayElement: boolean
): void {
  const entries = Object.entries(table)
  const subTables = entries.filter(([, value]) => isAeroTomlSection(value))
  const values = entries.filter(([, value]) => !isAeroTomlSection(value))
  const heading = path.map(renderKey).join('.')
  // toml_edit hides a table that holds nothing but sub-tables (it is implicit); an empty one stays.
  const visible = arrayElement || values.length > 0 || subTables.length === 0
  if (path.length === 0) {
    state.firstTable = values.length === 0
  } else if (visible) {
    state.output += `${state.firstTable ? '' : '\n'}${arrayElement ? `[[${heading}]]` : `[${heading}]`}\n`
    state.firstTable = false
  }
  for (const [key, value] of values) {
    state.output += `${renderKey(key)} = ${renderInline(value)}\n`
  }
  for (const [key, value] of subTables) {
    const children = isTableArray(value) ? value : isAeroTomlTable(value) ? [value] : []
    for (const child of children) {
      writeTable(state, child, [...path, key], isTableArray(value))
    }
  }
}

/** The text Aero would write for this document. */
export function renderAeroTomlDocument(root: AeroTomlTable): string {
  const state: LayoutState = { output: '', firstTable: true }
  writeTable(state, root, [], false)
  return state.output
}
