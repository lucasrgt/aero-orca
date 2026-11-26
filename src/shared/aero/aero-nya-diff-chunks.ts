const CHUNK_STEP = 78_000
const CHUNK_SIZE = 80_000

/** One line per text line, the way Rust's `str::lines` splits: no trailing empty line, `\r\n` as `\n`. */
function splitTextLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
}

/** The patch not-you-again synthesizes for an untracked file: git's own diff does not list it. */
export function buildAeroNyaNewFilePatch(path: string, content: string): string {
  const lines = splitTextLines(content)
  const added = lines.map((line) => `+${line}\n`).join('')
  return `\ndiff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${added}`
}

/** Paths of `git diff --name-status -z` output: every path, a rename or copy giving both, deduplicated. */
export function parseAeroNyaNameStatus(output: string): string[] {
  const fields = output.split('\0').filter((field) => field.length > 0)
  const paths: string[] = []
  for (let index = 0; index < fields.length;) {
    const status = fields[index]
    const path = fields[index + 1]
    if (path === undefined) {
      throw new Error('git returned a status without a path')
    }
    paths.push(path)
    index += 2
    if (status.startsWith('R') || status.startsWith('C')) {
      const destination = fields[index]
      if (destination === undefined) {
        throw new Error('git returned a rename without a destination')
      }
      paths.push(destination)
      index += 1
    }
  }
  return [...new Set(paths)]
}

/** Whether a `diff --git` header line names `path`, as `a/<path>` or `b/<path>` on a word boundary. */
function headerNamesPath(header: string, path: string): boolean {
  return ['a/', 'b/'].some((prefix) => {
    const needle = `${prefix}${path}`
    for (
      let from = header.indexOf(needle);
      from !== -1;
      from = header.indexOf(needle, from + needle.length)
    ) {
      const before = from === 0 ? undefined : header[from - 1]
      const end = from + needle.length
      const after = end === header.length ? undefined : header[end]
      const startsClean = before === undefined || before === ' ' || before === '"'
      const endsClean = after === undefined || after === ' ' || after === '"'
      if (startsClean && endsClean) {
        return true
      }
    }
    return false
  })
}

/** The part of a multi-file diff that belongs to `path`; empty when the diff does not touch it. */
export function changedAeroNyaChunk(body: string, path: string): string {
  const chunk = body.split('diff --git ').find((candidate) => {
    const firstLine = splitTextLines(candidate)[0]
    return firstLine !== undefined && headerNamesPath(firstLine, path)
  })
  return chunk ?? ''
}

/** Windows of 80,000 characters every 78,000, so a finding on a seam stays whole in one window. */
export function chunkAeroNyaDiff(value: string): string[] {
  const characters = Array.from(value)
  const chunks: string[] = []
  for (let start = 0; start < characters.length; start += CHUNK_STEP) {
    chunks.push(characters.slice(start, start + CHUNK_SIZE).join(''))
  }
  return chunks
}
