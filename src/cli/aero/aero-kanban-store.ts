import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { listFiles, probeDirectory, readGuardedFile } from '../../main/aero/aero-workspace-files'
import {
  applyAeroKanbanLoadDefaults,
  assertAeroKanbanRewriteSafe,
  normalizeAeroKanbanText,
  parseAeroKanbanDocument,
  type AeroKanbanDocument
} from '../../shared/aero/aero-kanban-document'
import { slugifyAeroKanban } from '../../shared/aero/aero-kanban-identifiers'
import { AeroKanbanError } from '../../shared/aero/aero-kanban-tables'
import { renderAeroTomlDocument } from '../../shared/aero/aero-toml-document-writer'
import { AeroWriteConflictError, writeAeroGuardedFile } from './aero-item-file-writer'
import { sweepStaleAeroKanbanTemps } from './aero-kanban-temp-sweep'
import { withAeroKnowledgeLock, type AeroKnowledgeLockOptions } from './aero-knowledge-lock'

const MAX_ATTEMPTS = 5
const BASE_FOLDERS = ['.aerofortress']
const KANBAN_FOLDERS = ['kanban']
const READ_TRIES = 3

/**
 * What a board file held when it was read: the bytes' hash, mtime and size (what the pre-rename check
 * compares) and the text with CRLF turned into LF (what is parsed, guarded and compared).
 */
type Snapshot = { text: string; hash: string; mtimeNs: bigint; size: bigint }

/** A board ready to be written: its new text, and what the file held when it was read. */
type Staged = { stem: string; text: string; snapshot: Snapshot | undefined }

export type AeroKanbanBoards = Map<string, AeroKanbanDocument>

export type AeroKanbanEdit<T> = {
  /** Every stem that changed, in write order; a stem whose text did not change is not written. */
  changed: Iterable<string>
  result: T
}

export type AeroKanbanStore = {
  /** Absolute path of a board's file. */
  boardPath: (stem: string) => string
  /** The board, or undefined when it does not exist; one that does not parse is an error. */
  read: (stem: string) => Promise<AeroKanbanDocument | undefined>
  /** Every board that parses, by stem; unreadable ones are named in `skipped`. */
  readAll: () => Promise<{ boards: AeroKanbanBoards; skipped: string[] }>
  /**
   * One locked read-modify-write over `required` boards (absent ones are not in the map) and, with
   * `all`, every other board that can be read (the rest are named in `skipped`). Every changed board
   * is rendered and checked before the first one is written, so a refusal writes nothing. Each is
   * re-checked against what was read just before its rename; a change under it re-runs `apply` on
   * fresh reads, a bounded number of times.
   */
  transact: <T>(
    options: { required: readonly string[]; all?: boolean },
    apply: (boards: AeroKanbanBoards) => AeroKanbanEdit<T>
  ) => Promise<{ result: T; skipped: string[] }>
}

function sameSnapshot(a: Snapshot | undefined, b: Snapshot | undefined): boolean {
  return a === undefined || b === undefined
    ? a === b
    : a.hash === b.hash && a.mtimeNs === b.mtimeNs && a.size === b.size
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createAeroKanbanStore(
  root: string,
  lockOptions: AeroKnowledgeLockOptions = {}
): AeroKanbanStore {
  const directory = join(root, '.aerofortress', 'kanban')
  const boardPath = (stem: string): string => join(directory, `${stem}.toml`)
  let writes: Promise<unknown> = Promise.resolve()
  let swept = false

  async function snapshotOf(stem: string): Promise<Snapshot | undefined> {
    const path = boardPath(stem)
    for (let attempt = 1; ; attempt += 1) {
      const before = await lstat(path, { bigint: true }).catch(() => null)
      const read = await readGuardedFile(root, path)
      if (read.status === 'missing' || before === null) {
        return undefined
      }
      if (read.status === 'skipped') {
        throw new AeroKanbanError(`board '${stem}' ${read.reason}`)
      }
      const after = await lstat(path, { bigint: true }).catch(() => null)
      if (after !== null && after.mtimeNs === before.mtimeNs && after.size === before.size) {
        const hash = createHash('sha256').update(read.text).digest('hex')
        const text = normalizeAeroKanbanText(read.text, stem)
        return { text, hash, mtimeNs: after.mtimeNs, size: after.size }
      }
      if (attempt >= READ_TRIES) {
        throw new AeroKanbanError(`board '${stem}' keeps changing while it is read; try again`)
      }
    }
  }

  async function assertDirectoryUsable(): Promise<boolean> {
    const probed = await probeDirectory(root, directory)
    if (probed.status === 'skipped') {
      throw new AeroKanbanError(`the kanban folder ${probed.reason}`)
    }
    return probed.status === 'ok'
  }

  function documentOf(snapshot: Snapshot, stem: string): AeroKanbanDocument {
    const document = parseAeroKanbanDocument(snapshot.text, stem)
    applyAeroKanbanLoadDefaults(document)
    return document
  }

  async function read(stem: string): Promise<AeroKanbanDocument | undefined> {
    if (!(await assertDirectoryUsable())) {
      return undefined
    }
    const snapshot = await snapshotOf(stem)
    return snapshot === undefined ? undefined : documentOf(snapshot, stem)
  }

  async function listStems(): Promise<string[]> {
    if (!(await assertDirectoryUsable())) {
      return []
    }
    const files = await listFiles(root, directory, '.toml', false, [])
    const stems = files.map((file) => file.slice(directory.length + 1, -'.toml'.length))
    // Aero finds a board by the slug of its name, so a file named otherwise is unreachable to it too.
    return stems.filter((stem) => stem === slugifyAeroKanban(stem))
  }

  async function readAll(): Promise<{ boards: AeroKanbanBoards; skipped: string[] }> {
    const boards: AeroKanbanBoards = new Map()
    const skipped: string[] = []
    for (const stem of await listStems()) {
      try {
        const document = await read(stem)
        if (document !== undefined) {
          boards.set(stem, document)
        }
      } catch {
        skipped.push(stem)
      }
    }
    return { boards, skipped }
  }

  /** Renders and guards every changed board; throws, before anything is written, if one is unsafe. */
  function stage(
    changed: Iterable<string>,
    boards: AeroKanbanBoards,
    snapshots: Map<string, Snapshot | undefined>
  ): Staged[] {
    const staged: Staged[] = []
    for (const stem of new Set(changed)) {
      const document = boards.get(stem)
      if (document === undefined) {
        continue
      }
      const text = renderAeroTomlDocument(document.tree)
      const snapshot = snapshots.get(stem)
      if (snapshot !== undefined) {
        // the same text, whatever its line endings were: an unchanged board is never rewritten
        if (text === snapshot.text) {
          continue
        }
        assertAeroKanbanRewriteSafe(snapshot.text, parseAeroKanbanDocument(snapshot.text, stem))
      }
      staged.push({ stem, text, snapshot })
    }
    return staged
  }

  async function writeStaged(board: Staged): Promise<void> {
    await writeAeroGuardedFile(
      root,
      BASE_FOLDERS,
      KANBAN_FOLDERS,
      `${board.stem}.toml`,
      board.text,
      'replace',
      async () => {
        const now = await snapshotOf(board.stem).catch(() => null)
        return now !== null && sameSnapshot(board.snapshot, now)
      }
    )
  }

  async function attempt<T>(
    options: { required: readonly string[]; all?: boolean },
    apply: (boards: AeroKanbanBoards) => AeroKanbanEdit<T>,
    written: Set<string>
  ): Promise<{ result: T; skipped: string[] } | 'conflict'> {
    const boards: AeroKanbanBoards = new Map()
    const snapshots = new Map<string, Snapshot | undefined>()
    const skipped: string[] = []
    const usable = await assertDirectoryUsable()
    const stems = new Set(options.required)
    if (options.all === true) {
      for (const stem of await listStems()) {
        stems.add(stem)
      }
    }
    for (const stem of stems) {
      try {
        const snapshot = usable ? await snapshotOf(stem) : undefined
        if (snapshot !== undefined) {
          boards.set(stem, documentOf(snapshot, stem))
        }
        snapshots.set(stem, snapshot)
      } catch (error) {
        if (options.required.includes(stem)) {
          throw error
        }
        skipped.push(stem)
      }
    }
    const edit = apply(boards)
    const staged = stage(edit.changed, boards, snapshots)
    for (const [index, board] of staged.entries()) {
      try {
        await writeStaged(board)
        written.add(board.stem)
      } catch (error) {
        if (error instanceof AeroWriteConflictError) {
          return 'conflict'
        }
        if (written.size === 0) {
          throw error
        }
        const left = staged.slice(index).map((entry) => entry.stem)
        throw new AeroKanbanError(
          `${reasonOf(error)}; boards already written: ${[...written].join(', ')}; not written: ${left.join(', ')}`
        )
      }
    }
    return { result: edit.result, skipped }
  }

  async function transact<T>(
    options: { required: readonly string[]; all?: boolean },
    apply: (boards: AeroKanbanBoards) => AeroKanbanEdit<T>
  ): Promise<{ result: T; skipped: string[] }> {
    const run = (): Promise<{ result: T; skipped: string[] }> =>
      withAeroKnowledgeLock(
        root,
        async () => {
          if (!swept && (await assertDirectoryUsable())) {
            swept = true
            await sweepStaleAeroKanbanTemps(directory)
          }
          // a retry re-applies the edit to fresh reads; every edit is idempotent on a board it wrote
          const written = new Set<string>()
          for (let tries = 1; tries <= MAX_ATTEMPTS; tries += 1) {
            const outcome = await attempt(options, apply, written)
            if (outcome !== 'conflict') {
              return outcome
            }
          }
          const partial =
            written.size === 0
              ? 'nothing was written'
              : `already written: ${[...written].join(', ')}`
          throw new AeroKanbanError(
            `the board keeps changing under this write (is another program editing it?); ${partial}; try again`
          )
        },
        lockOptions
      )
    // One write at a time in this process, and one process at a time on the repo (the lock file).
    const queued = writes.then(run, run)
    writes = queued.catch(() => {})
    return queued
  }

  return { boardPath, read, readAll, transact }
}
