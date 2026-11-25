import type { AeroAutopilotReading } from './aero-autopilot-policy'
import type { AeroKanbanBoard } from './aero-kanban-board'
import type { AeroKnowledgeItem } from './aero-knowledge-item'
import type { AeroNyaConfig, AeroNyaJudgeConfig, AeroNyaScar } from './aero-nya'
import type { AeroPipelineAttestation, AeroPipelineDef, AeroPipelineRun } from './aero-pipeline'
import type { AeroAgent, AeroLoop, AeroRoutine } from './aero-prompt-definitions'
import type { AeroSpecFile } from './aero-spec-file'

/** A parsed artifact plus the repo-relative path (forward slashes) it came from. */
export type AeroLocated<T> = T & { path: string }

export type AeroIssue = { path: string; reason: string }

export type AeroWorkspaceSnapshot = {
  repoPath: string
  readAt: string
  hasAerofortressDir: boolean
  hasNyaDir: boolean
  hasReadme: boolean
  /** Knowledge items grouped by their slug (the cell). */
  itemsByCell: Record<string, AeroKnowledgeItem[]>
  digests: AeroKnowledgeItem[]
  constitution: AeroKnowledgeItem[]
  boards: AeroLocated<AeroKanbanBoard>[]
  autopilot: AeroAutopilotReading
  routines: AeroLocated<AeroRoutine>[]
  loops: AeroLocated<AeroLoop>[]
  agents: AeroLocated<AeroAgent>[]
  specs: AeroLocated<AeroSpecFile>[]
  pipelines: {
    defs: AeroLocated<AeroPipelineDef>[]
    activeRun: AeroLocated<AeroPipelineRun> | null
    attestation: AeroLocated<AeroPipelineAttestation> | null
  }
  nya: {
    config: AeroLocated<AeroNyaConfig> | null
    judge: AeroLocated<AeroNyaJudgeConfig> | null
    scars: AeroLocated<AeroNyaScar>[]
  }
  issues: AeroIssue[]
}

export type AeroSnapshotSummary = {
  repoPath: string
  found: { aerofortress: boolean; nya: boolean }
  counts: {
    items: number
    cells: number
    digests: number
    constitution: number
    /** Stale and still live: network.rs leaves retired items out of its stale list. */
    staleItems: number
    replacedItems: number
    boards: number
    cards: number
    routines: number
    loops: number
    agents: number
    specs: number
    pipelineDefs: number
    scars: number
    issues: number
  }
  autopilot: {
    fileExists: boolean
    level: string
    declaredLevel: string
    valid: boolean
    errors: string[]
  }
  boards: { name: string; mode: string; columns: number; cards: number }[]
  routines: { name: string; schedule: string; understood: boolean }[]
  issues: AeroIssue[]
}

export function summarizeAeroSnapshot(snapshot: AeroWorkspaceSnapshot): AeroSnapshotSummary {
  const items = Object.values(snapshot.itemsByCell).flat()
  return {
    repoPath: snapshot.repoPath,
    found: { aerofortress: snapshot.hasAerofortressDir, nya: snapshot.hasNyaDir },
    counts: {
      items: items.length,
      cells: Object.keys(snapshot.itemsByCell).length,
      digests: snapshot.digests.length,
      constitution: snapshot.constitution.length,
      staleItems: items.filter((item) => item.stale && !item.replaced).length,
      replacedItems: items.filter((item) => item.replaced).length,
      boards: snapshot.boards.length,
      cards: snapshot.boards.reduce((total, board) => total + board.cards.length, 0),
      routines: snapshot.routines.length,
      loops: snapshot.loops.length,
      agents: snapshot.agents.length,
      specs: snapshot.specs.length,
      pipelineDefs: snapshot.pipelines.defs.length,
      scars: snapshot.nya.scars.length,
      issues: snapshot.issues.length
    },
    autopilot: {
      fileExists: snapshot.autopilot.fileExists,
      level: snapshot.autopilot.level,
      declaredLevel: snapshot.autopilot.declaredLevel,
      valid: snapshot.autopilot.valid,
      errors: snapshot.autopilot.errors
    },
    boards: snapshot.boards.map((board) => ({
      name: board.name,
      mode: board.mode,
      columns: board.columns.length,
      cards: board.cards.length
    })),
    routines: snapshot.routines.map((routine) => ({
      name: routine.name,
      schedule: routine.schedule,
      understood: routine.parsedSchedule !== null
    })),
    issues: snapshot.issues
  }
}
