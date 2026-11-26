import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { listFiles, probeDirectory, readGuardedFile } from '../../main/aero/aero-workspace-files'
import {
  applyAeroKanbanLoadDefaults,
  assertAeroKanbanRewriteSafe,
  parseAeroKanbanDocument,
  type AeroKanbanDocument
} from '../../shared/aero/aero-kanban-document'
import { slugifyAeroKanban } from '../../shared/aero/aero-kanban-identifiers'
import { AeroKanbanError } from '../../shared/aero/aero-kanban-tables'
import { renderAeroTomlDocument } from '../../shared/aero/aero-toml-document-writer'
import { AeroWriteConflictError, writeAeroGuardedFile } from './aero-item-file-writer'
import { withAeroKnowledgeLock, type AeroKnowledgeLockOptions } from './aero-knowledge-lock'

const MAX_ATTEMPTS = 5
const BASE_FOLDERS = ['.aerofortress']
const KANBAN_FOLDERS = ['kanban']
const READ_TRIES = 3

/** What a board file held when it was read: the text, a hash of it, and when and how big it was. */
type Snapshot = { text: string; hash: string; mtimeNs: bigint; size: bigint }

export type AeroKanbanBoards = Map<string, AeroKanbanDocument>

export type AeroKanbanEdit<T> = {
  /** Every stem that changed; a stem whose text did not change is not written. */
  changed: Iterable<string>
  result: T
}

export type AeroKanbanStore = {
  /** Absolute path of a board's file. */
  boardPath: (stem: string) => string
  /** The board, or undefined when it does not exist; one that does not parse is an error. */
  read: (stem: string) => Promise<AeroKanbanDocument | undefined>
  /** Every board that parses, by stem; unparsable ones are named in `skipped`. */
  readAll: () => Promise<{ boards: AeroKanbanBoards; skipped: string[] }>
  /**
   * One locked read-modify-write over `required` boards (absent ones are not in the map) and, with
   * `all`, every other board that parses. Written boards are re-checked against what was read just
   * before the rename; a change under it re-runs `apply` on fresh reads, a bounded number of times.
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

export function createAeroKanbanStore(
  root: string,
  lockOptions: AeroKnowledgeLockOptions = {}
): AeroKanbanStore {
  const directory = join(root, '.aerofortress', 'kanban')
  const boardPath = (stem: string): string => join(directory, `${stem}.toml`)
  let writes: Promise<unknown> = Promise.resolve()

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
        return { text: read.text, hash, mtimeNs: after.mtimeNs, size: after.size }
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

  async function read(stem: string): Promise<AeroKanbanDocument | undefined> {
    if (!(await assertDirectoryUsable())) {
      return undefined
    }
    const snapshot = await snapshotOf(stem)
    if (snapshot === undefined) {
      return undefined
    }
    const document = parseAeroKanbanDocument(snapshot.text, stem)
    applyAeroKanbanLoadDefaults(document)
    return document
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

  /** Writes a changed board, or reports that it was not safe to; true when something was written. */
  async function commit(
    stem: string,
    document: AeroKanbanDocument,
    snapshot: Snapshot | undefined
  ): Promise<boolean> {
    const text = renderAeroTomlDocument(document.tree)
    if (snapshot !== undefined) {
      if (text === snapshot.text) {
        return false
      }
      assertAeroKanbanRewriteSafe(snapshot.text, parseAeroKanbanDocument(snapshot.text, stem))
    }
    await writeAeroGuardedFile(
      root,
      BASE_FOLDERS,
      KANBAN_FOLDERS,
      `${stem}.toml`,
      text,
      'replace',
      async () => sameSnapshot(snapshot, await snapshotOf(stem))
    )
    return true
  }

  async function attempt<T>(
    options: { required: readonly string[]; all?: boolean },
    apply: (boards: AeroKanbanBoards) => AeroKanbanEdit<T>
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
      const snapshot = usable ? await snapshotOf(stem) : undefined
      snapshots.set(stem, snapshot)
      if (snapshot === undefined) {
        continue
      }
      try {
        const document = parseAeroKanbanDocument(snapshot.text, stem)
        applyAeroKanbanLoadDefaults(document)
        boards.set(stem, document)
      } catch (error) {
        if (options.required.includes(stem)) {
          throw error
        }
        skipped.push(stem)
      }
    }
    const edit = apply(boards)
    try {
      for (const stem of new Set(edit.changed)) {
        const document = boards.get(stem)
        if (document !== undefined) {
          await commit(stem, document, snapshots.get(stem))
        }
      }
    } catch (error) {
      if (error instanceof AeroWriteConflictError) {
        return 'conflict'
      }
      throw error
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
          for (let tries = 1; tries <= MAX_ATTEMPTS; tries += 1) {
            const outcome = await attempt(options, apply)
            if (outcome !== 'conflict') {
              return outcome
            }
          }
          throw new AeroKanbanError(
            'the board keeps changing under this write (is another program editing it?); try again'
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
