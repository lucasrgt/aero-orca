import { join, resolve } from 'node:path'
import {
  AERO_AGENT_RECALL_LIMIT,
  fitAeroPackContext,
  fitAeroRecallContext,
  formatAeroRecallErrorContext
} from '../../shared/aero/aero-agent-injection'
import { aeroNyaScarToJson } from '../../shared/aero/aero-nya-scar-format'
import { packAeroKnowledge } from '../../shared/aero/aero-knowledge-pack'
import { probeDirectory, probeFile } from '../../main/aero/aero-workspace-files'
import { createAeroKnowledgeCorpusReader } from './aero-knowledge-corpus'
import { resolveAeroKnowledgeRoot } from './aero-knowledge-root'
import { resolveAeroNyaRepository } from './aero-nya-git'
import { recallAeroNya } from './aero-nya-operations'

/** The context an agent starts a session with, or null for a folder with no AeroFortress network. */
export async function aeroSessionStartContext(cwd: string, now: Date): Promise<string | null> {
  const root = await resolveAeroKnowledgeRoot(resolve(cwd), false).catch(() => null)
  if (root === null) {
    return null
  }
  const { index } = await createAeroKnowledgeCorpusReader(root).read()
  return fitAeroPackContext((budgetTokens) =>
    packAeroKnowledge(index, undefined, budgetTokens, now)
  )
}

/** nya.rs `status.initialized`: a config and a scars folder, so a bare `.nya` injects nothing. */
async function isAeroNyaInitialized(root: string): Promise<boolean> {
  const [config, scars] = await Promise.all([
    probeFile(root, join(root, '.nya', 'config.toml')),
    probeDirectory(root, join(root, '.nya', 'scars'))
  ])
  return config.status === 'ok' && scars.status === 'ok'
}

/**
 * The scars to put before a prompt, or null when the folder is not an initialized NYA repo or
 * nothing is relevant. A failed recall is announced to the agent, as AeroFortress does, never
 * hidden: the agent must not claim the recurrence gate passed.
 */
export async function aeroPromptRecallContext(cwd: string, prompt: string): Promise<string | null> {
  const root = await resolveAeroNyaRepository(resolve(cwd)).catch(() => null)
  if (root === null || !(await isAeroNyaInitialized(root))) {
    return null
  }
  try {
    const scars = await recallAeroNya(root, {
      task: prompt,
      paths: [],
      limit: AERO_AGENT_RECALL_LIMIT
    })
    return scars.length === 0 ? null : fitAeroRecallContext(scars.map(aeroNyaScarToJson))
  } catch (error) {
    return formatAeroRecallErrorContext(error instanceof Error ? error.message : String(error))
  }
}
