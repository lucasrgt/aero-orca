import { basename, extname, join } from 'node:path'
import {
  absentAeroAutopilotReading,
  parseAeroAutopilotPolicy,
  unusableAeroAutopilotReading,
  type AeroAutopilotReading
} from '../../shared/aero/aero-autopilot-policy'
import { parseAeroKanbanBoard } from '../../shared/aero/aero-kanban-board'
import {
  collectAeroReplacedIds,
  parseAeroKnowledgeItem,
  type AeroKnowledgeItem
} from '../../shared/aero/aero-knowledge-item'
import {
  parseAeroNyaConfig,
  parseAeroNyaJudgeConfig,
  parseAeroNyaScar
} from '../../shared/aero/aero-nya'
import {
  parseAeroPipelineAttestation,
  parseAeroPipelineDef,
  parseAeroPipelineRun
} from '../../shared/aero/aero-pipeline'
import {
  parseAeroAgent,
  parseAeroLoop,
  parseAeroRoutine
} from '../../shared/aero/aero-prompt-definitions'
import type { AeroParseResult } from '../../shared/aero/aero-parse-result'
import { parseAeroSpecFile } from '../../shared/aero/aero-spec-file'
import type {
  AeroIssue,
  AeroLocated,
  AeroWorkspaceSnapshot
} from '../../shared/aero/aero-workspace-snapshot'
import {
  listFiles,
  parseFiles,
  probeDirectory,
  probeFile,
  readGuardedFile,
  resolveAeroRepoRoot,
  toRepoRelativePath,
  type AeroGuardedRead,
  type AeroParseFile
} from './aero-workspace-files'

const AEROFORTRESS_DIR = '.aerofortress'
const NYA_DIR = '.nya'

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A skipped or unreadable file exists but cannot be trusted: the policy fails closed to `off`. */
async function readAutopilotPolicy(
  root: string,
  read: AeroGuardedRead | Error,
  issues: AeroIssue[]
): Promise<AeroAutopilotReading> {
  const path = toRepoRelativePath(root, join(root, AEROFORTRESS_DIR, 'autopilot.toml'))
  let reading: AeroAutopilotReading
  if (read instanceof Error) {
    reading = unusableAeroAutopilotReading(`could not be read: ${read.message}`)
  } else if (read.status === 'skipped') {
    reading = unusableAeroAutopilotReading(read.reason)
  } else {
    reading =
      read.status === 'missing' ? absentAeroAutopilotReading() : parseAeroAutopilotPolicy(read.text)
  }
  issues.push(...reading.errors.map((reason) => ({ path, reason })))
  return reading
}

/** The single-file artifacts (active run, proof ledger, NYA configs): absent is fine, broken is an issue. */
async function readOptionalFile<T>(
  root: string,
  file: string,
  parse: AeroParseFile<T>,
  issues: AeroIssue[]
): Promise<AeroLocated<T> | null> {
  const path = toRepoRelativePath(root, file)
  let result: AeroParseResult<T>
  try {
    const read = await readGuardedFile(root, file)
    if (read.status === 'missing') {
      return null
    }
    result =
      read.status === 'skipped'
        ? { ok: false, issues: [read.reason] }
        : parse(read.text, path, basename(file, extname(file)))
  } catch (error) {
    result = { ok: false, issues: [`could not be read: ${failureReason(error)}`] }
  }
  if (!result.ok) {
    issues.push(...result.issues.map((reason) => ({ path, reason })))
    return null
  }
  return { ...result.value, path }
}

function groupItemsByCell(items: AeroKnowledgeItem[]): Record<string, AeroKnowledgeItem[]> {
  const cells: Record<string, AeroKnowledgeItem[]> = {}
  for (const item of items) {
    ;(cells[item.slug] ??= []).push(item)
  }
  return cells
}

/**
 * Whether a root folder may be walked. A symlink or an escape is reported once, with the reason, and
 * the folder is treated as not walkable: nothing below it is read.
 */
async function openRootFolder(
  root: string,
  folder: string,
  issues: AeroIssue[]
): Promise<{ present: boolean; walkable: boolean; skippedReason: string | null }> {
  const probed = await probeDirectory(root, folder)
  if (probed.status === 'skipped') {
    issues.push({ path: toRepoRelativePath(root, folder), reason: probed.reason })
    return { present: false, walkable: false, skippedReason: probed.reason }
  }
  const present = probed.status === 'ok'
  return { present, walkable: present, skippedReason: null }
}

/**
 * Read-only: walks `.aerofortress/` and `.nya/` and never writes. One bad file only adds an issue.
 * Every fixed path is checked first: a symlink is skipped, a path resolving outside the repo is
 * skipped, and a file over 4 MB is skipped, each reported as an issue.
 */
export async function readAeroWorkspace(
  repoPath: string,
  now: Date = new Date()
): Promise<AeroWorkspaceSnapshot> {
  const issues: AeroIssue[] = []
  const root = await resolveAeroRepoRoot(repoPath)
  const aeroDir = join(root, AEROFORTRESS_DIR)
  const nyaDir = join(root, NYA_DIR)
  const [aero, nya] = [
    await openRootFolder(root, aeroDir, issues),
    await openRootFolder(root, nyaDir, issues)
  ]
  const filesIn = async (
    folder: { walkable: boolean },
    directory: string,
    extension: string,
    recursive = false
  ): Promise<string[]> =>
    folder.walkable ? listFiles(root, directory, extension, recursive, issues) : []
  const optionalIn = async <T>(
    folder: { walkable: boolean },
    file: string,
    parse: AeroParseFile<T>
  ): Promise<AeroLocated<T> | null> =>
    folder.walkable ? readOptionalFile(root, file, parse, issues) : null
  const parseAll = <T>(files: string[], parse: AeroParseFile<T>): Promise<AeroLocated<T>[]> =>
    parseFiles(root, files, parse, issues)

  const hasReadme =
    aero.walkable && (await probeFile(root, join(aeroDir, 'README.md'))).status === 'ok'

  const parsedItems = await parseAll(
    await filesIn(aero, join(aeroDir, 'items'), '.md', true),
    (raw, path) => parseAeroKnowledgeItem(raw, path, now)
  )
  // network.rs keeps retired items (ranking only penalises them); they are flagged, never dropped.
  const replacedIds = collectAeroReplacedIds(parsedItems)
  const items = parsedItems.map((item) => ({ ...item, replaced: replacedIds.has(item.id) }))
  const boards = await parseAll(
    await filesIn(aero, join(aeroDir, 'kanban'), '.toml'),
    (raw, _path, stem) => parseAeroKanbanBoard(raw, stem)
  )
  const routines = await parseAll(
    await filesIn(aero, join(aeroDir, 'routines'), '.md'),
    (raw, _path, stem) => ({ ok: true, value: parseAeroRoutine(raw, stem) })
  )
  for (const routine of routines) {
    if (routine.scheduleIssue) {
      issues.push({
        path: routine.path,
        reason: `routine "${routine.name}": ${routine.scheduleIssue}`
      })
    }
  }
  const loops = await parseAll(
    await filesIn(aero, join(aeroDir, 'loops'), '.md'),
    (raw, _path, stem) => ({ ok: true, value: parseAeroLoop(raw, stem) })
  )
  const agents = await parseAll(
    await filesIn(aero, join(aeroDir, 'agents'), '.md'),
    (raw, _path, stem) => ({ ok: true, value: parseAeroAgent(raw, stem) })
  )
  const specs = await parseAll(
    await filesIn(aero, join(aeroDir, 'specs'), '.md'),
    (raw, _path, stem) => ({ ok: true, value: parseAeroSpecFile(raw, stem) })
  )
  const pipelineDefs = await parseAll(
    await filesIn(aero, join(aeroDir, 'pipelines'), '.toml'),
    (raw, _path, stem) => parseAeroPipelineDef(raw, stem)
  )
  const scars = await parseAll(await filesIn(nya, join(nyaDir, 'scars'), '.toml'), (raw) =>
    parseAeroNyaScar(raw)
  )
  // A policy file behind a skipped `.aerofortress` is not "absent": fail closed.
  const autopilotRead: AeroGuardedRead | Error = aero.skippedReason
    ? { status: 'skipped', reason: aero.skippedReason }
    : await readGuardedFile(root, join(aeroDir, 'autopilot.toml')).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error))
      )

  return {
    repoPath,
    readAt: now.toISOString(),
    hasAerofortressDir: aero.present,
    hasNyaDir: nya.present,
    hasReadme,
    itemsByCell: groupItemsByCell(items),
    // A replaced item stays listed with `replaced: true`, like network.rs `pack_detailed`.
    digests: items.filter((item) => item.isDigest),
    constitution: items.filter((item) => item.isConstitution),
    boards,
    autopilot: await readAutopilotPolicy(root, autopilotRead, issues),
    routines,
    loops,
    agents,
    specs,
    pipelines: {
      defs: pipelineDefs,
      activeRun: await optionalIn(aero, join(aeroDir, 'pipeline.toml'), (raw) =>
        parseAeroPipelineRun(raw)
      ),
      attestation: await optionalIn(aero, join(aeroDir, 'pipeline.attest.toml'), (raw) =>
        parseAeroPipelineAttestation(raw)
      )
    },
    nya: {
      config: await optionalIn(nya, join(nyaDir, 'config.toml'), (raw) => parseAeroNyaConfig(raw)),
      judge: await optionalIn(nya, join(nyaDir, 'config.local.toml'), (raw) =>
        parseAeroNyaJudgeConfig(raw)
      ),
      scars
    },
    issues
  }
}
