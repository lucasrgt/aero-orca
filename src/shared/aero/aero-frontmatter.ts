// AeroFortress frontmatter is line based, not YAML: `key: value` split at the first colon.

export type AeroFrontmatterSplit = { header: string; body: string }

/** Mirrors network.rs `parse_item`: a `---` prefix, and the header ends at the first `\n---`. */
export function splitAeroFrontmatter(raw: string): AeroFrontmatterSplit | null {
  if (!raw.startsWith('---')) {
    return null
  }
  const rest = raw.slice(3)
  const end = rest.indexOf('\n---')
  if (end === -1) {
    return null
  }
  return { header: rest.slice(0, end), body: rest.slice(end + 4).trim() }
}

/** Lines without a colon are skipped and a repeated key keeps its last value, like the Rust loop. */
export function readAeroFrontmatterFields(header: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const line of header.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon !== -1) {
      fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
    }
  }
  return fields
}

export function splitAeroCommaList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}
