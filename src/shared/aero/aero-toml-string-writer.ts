// toml_writer 1.x `TomlStringBuilder::as_default`, the string style the `toml` crate's pretty
// serializer writes: basic when plain, else literal, else multi-line basic, else multi-line literal.

type StringMetrics = {
  maxSingleQuoteRun: number
  maxDoubleQuoteRun: number
  escapeCodes: boolean
  backslash: boolean
  newline: boolean
}

function measureString(value: string): StringMetrics {
  const metrics: StringMetrics = {
    maxSingleQuoteRun: 0,
    maxDoubleQuoteRun: 0,
    escapeCodes: false,
    backslash: false,
    newline: false
  }
  let singleRun = 0
  let doubleRun = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    singleRun = code === 0x27 ? singleRun + 1 : 0
    doubleRun = code === 0x22 ? doubleRun + 1 : 0
    metrics.maxSingleQuoteRun = Math.max(metrics.maxSingleQuoteRun, singleRun)
    metrics.maxDoubleQuoteRun = Math.max(metrics.maxDoubleQuoteRun, doubleRun)
    if (code === 0x5c) {
      metrics.backslash = true
    } else if (code === 0x0a) {
      metrics.newline = true
    } else if (code !== 0x09 && (code <= 0x1f || code === 0x7f)) {
      metrics.escapeCodes = true
    }
  }
  return metrics
}

const SIMPLE_ESCAPES = new Map<number, string>([
  [0x08, '\\b'],
  [0x09, '\\t'],
  [0x0c, '\\f'],
  [0x0d, '\\r'],
  [0x5c, '\\\\']
])

function escapeBasic(value: string, multiline: boolean): string {
  const allowedQuoteRun = multiline ? 2 : 0
  let output = ''
  let quoteRun = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const char = value[index]
    if (code === 0x22) {
      quoteRun += 1
      if (quoteRun > allowedQuoteRun) {
        output += '\\"'
        quoteRun = 0
      } else {
        output += char
      }
      continue
    }
    quoteRun = 0
    const simple = SIMPLE_ESCAPES.get(code)
    if (simple !== undefined) {
      output += simple
    } else if (code === 0x0a) {
      output += multiline ? char : '\\n'
    } else if (code <= 0x1f || code === 0x7f) {
      output += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      output += char
    }
  }
  return output
}

function renderBasic(value: string): string {
  return `"${escapeBasic(value, false)}"`
}

function renderMultilineBasic(value: string, metrics: StringMetrics): string {
  return `"""${metrics.newline ? '\n' : ''}${escapeBasic(value, true)}"""`
}

function renderMultilineLiteral(value: string, metrics: StringMetrics): string {
  return `'''${metrics.newline ? '\n' : ''}${value}'''`
}

/** A TOML string value exactly as the Rust `toml` crate's pretty serializer writes it. */
export function renderTomlString(value: string): string {
  const metrics = measureString(value)
  const plainBasic =
    !metrics.escapeCodes &&
    !metrics.backslash &&
    metrics.maxDoubleQuoteRun === 0 &&
    !metrics.newline
  if (plainBasic) {
    return renderBasic(value)
  }
  if (!metrics.escapeCodes && metrics.maxSingleQuoteRun === 0 && !metrics.newline) {
    return `'${value}'`
  }
  if (!metrics.escapeCodes && !metrics.backslash && metrics.maxDoubleQuoteRun <= 2) {
    return renderMultilineBasic(value, metrics)
  }
  if (!metrics.escapeCodes && metrics.maxSingleQuoteRun <= 2) {
    return renderMultilineLiteral(value, metrics)
  }
  return metrics.newline ? renderMultilineBasic(value, metrics) : renderBasic(value)
}

/** An array of strings the way `toml::to_string_pretty` lays it out: inline up to one element. */
export function renderTomlStringArray(values: readonly string[]): string {
  if (values.length < 2) {
    return `[${values.map(renderTomlString).join('')}]`
  }
  const lines = values.map((value) => `    ${renderTomlString(value)},\n`)
  return `[\n${lines.join('')}]`
}
