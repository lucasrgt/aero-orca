export type AeroSpecFile = { title: string; clockwork: boolean }

const CLOCKWORK_MARKER = '<!-- clockwork-spec -->'

/** Specs are free-form Markdown; Aero only needs a title, the first `# ` heading or the file stem. */
export function parseAeroSpecFile(raw: string, fileStem: string): AeroSpecFile {
  const heading = raw.split(/\r?\n/).find((line) => line.startsWith('# '))
  return {
    title: heading ? heading.slice(2).trim() : fileStem,
    clockwork: raw.includes(CLOCKWORK_MARKER)
  }
}
