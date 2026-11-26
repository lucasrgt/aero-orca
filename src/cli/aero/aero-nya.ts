import { resolve } from 'node:path'
import { aeroNyaScarToJson } from '../../shared/aero/aero-nya-scar-format'
import type { AeroNyaRememberRequest } from '../../shared/aero/aero-nya-remember'
import { getOptionalStringFlag, getRepeatedStringFlag } from '../arguments/flags'
import type { CommandHandler } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'
import { formatAeroNyaCheck, formatAeroNyaRecall, formatAeroNyaRemember } from './aero-nya-format'
import { resolveAeroNyaRepository } from './aero-nya-git'
import { checkAeroNya, recallAeroNya, rememberAeroNya } from './aero-nya-operations'
import { assertAeroLocalExecution, readAeroPathFlag } from './aero-local-only'

const DEFAULT_RECALL_LIMIT = 12
const MAX_RECALL_LIMIT = 40

type Flags = Map<string, string | boolean>

async function repositoryOf(flags: Flags, cwd: string, command: string): Promise<string> {
  assertAeroLocalExecution(flags, command, 'it reads and writes the git repo of this machine')
  const pathFlag = readAeroPathFlag(flags)
  return resolveAeroNyaRepository(resolve(cwd, pathFlag ?? '.')).catch((error: unknown) => {
    throw new RuntimeClientError(
      'invalid_argument',
      error instanceof Error ? error.message : String(error)
    )
  })
}

function stringFlag(flags: Flags, name: string): string | undefined {
  return getOptionalStringFlag(flags, name)
}

function listFlag(flags: Flags, name: string): string[] {
  return getRepeatedStringFlag(flags, name)
}

function recallLimit(flags: Flags): number {
  const raw = stringFlag(flags, 'limit')
  if (raw === undefined) {
    return DEFAULT_RECALL_LIMIT
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new RuntimeClientError('invalid_argument', '--limit must be a positive integer')
  }
  return Math.min(value, MAX_RECALL_LIMIT)
}

function rememberRequest(flags: Flags): AeroNyaRememberRequest {
  return {
    scar: stringFlag(flags, 'scar'),
    title: stringFlag(flags, 'title'),
    lesson: stringFlag(flags, 'lesson'),
    scope: listFlag(flags, 'scope'),
    tags: listFlag(flags, 'tag'),
    source: stringFlag(flags, 'source'),
    githubReview: stringFlag(flags, 'github-review'),
    reportedBy: stringFlag(flags, 'reported-by'),
    correctedBy: stringFlag(flags, 'corrected-by'),
    recordedBy: stringFlag(flags, 'recorded-by')
  }
}

export const AERO_NYA_HANDLERS: Record<string, CommandHandler> = {
  'aero nya recall': async ({ flags, cwd, json }) => {
    const root = await repositoryOf(flags, cwd, 'orca aero nya recall')
    const scars = await recallAeroNya(root, {
      task: stringFlag(flags, 'task') ?? '',
      paths: listFlag(flags, 'paths'),
      limit: recallLimit(flags)
    })
    console.log(
      json ? JSON.stringify(scars.map(aeroNyaScarToJson), null, 2) : formatAeroNyaRecall(scars)
    )
  },
  'aero nya remember': async ({ flags, cwd, json }) => {
    const root = await repositoryOf(flags, cwd, 'orca aero nya remember')
    const scar = await rememberAeroNya(root, rememberRequest(flags))
    console.log(
      json ? JSON.stringify(aeroNyaScarToJson(scar), null, 2) : formatAeroNyaRemember(scar)
    )
  },
  'aero nya check': async ({ flags, cwd, json }) => {
    const root = await repositoryOf(flags, cwd, 'orca aero nya check')
    const result = await checkAeroNya(root, { base: stringFlag(flags, 'base') })
    console.log(json ? JSON.stringify(result, null, 2) : formatAeroNyaCheck(result))
    if (!result.passed) {
      process.exitCode = 1
    }
  }
}
