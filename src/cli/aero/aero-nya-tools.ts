import { aeroNyaScarToJson } from '../../shared/aero/aero-nya-scar-format'
import type { AeroNyaRememberRequest } from '../../shared/aero/aero-nya-remember'
import { resolveAeroNyaRepository } from './aero-nya-git'
import {
  checkAeroNya,
  recallAeroNya,
  rememberAeroNya,
  type AeroNyaOperationOptions
} from './aero-nya-operations'

type ToolArgs = Record<string, unknown>

const MIN_RECALL_LIMIT = 1
const MAX_RECALL_LIMIT = 40

export type AeroNyaTools = {
  handles: (name: string) => boolean
  call: (name: string, args: ToolArgs) => Promise<string>
}

function stringArg(args: ToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function stringList(args: ToolArgs, key: string): string[] {
  const value = args[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/** serde's `as_u64`, as Aero's `nya::recall` then clamps it to 1..40. */
function recallLimit(args: ToolArgs): number | undefined {
  const value = args.limit
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined
  }
  return Math.min(Math.max(value, MIN_RECALL_LIMIT), MAX_RECALL_LIMIT)
}

function rememberRequest(args: ToolArgs): AeroNyaRememberRequest {
  return {
    scar: stringArg(args, 'scar'),
    title: stringArg(args, 'title'),
    lesson: stringArg(args, 'lesson'),
    scope: stringList(args, 'scope'),
    tags: stringList(args, 'tags'),
    source: stringArg(args, 'source'),
    githubReview: stringArg(args, 'github_review'),
    reportedBy: stringArg(args, 'reported_by'),
    correctedBy: stringArg(args, 'corrected_by'),
    recordedBy: stringArg(args, 'recorded_by')
  }
}

/**
 * `nya_recall`, `nya_remember` and `nya_check` for the git repository holding `start`, answering with
 * the JSON AeroFortress's server prints (compact). `workspace` is accepted and ignored: one repo.
 */
export function createAeroNyaTools(
  start: string,
  options: AeroNyaOperationOptions = {}
): AeroNyaTools {
  const handlers: Record<string, (root: string, args: ToolArgs) => Promise<string>> = {
    nya_recall: async (root, args) => {
      const task = stringArg(args, 'task')
      if (task === undefined) {
        throw new Error('task is required')
      }
      const scars = await recallAeroNya(root, {
        task,
        paths: stringList(args, 'paths'),
        limit: recallLimit(args)
      })
      return JSON.stringify(scars.map(aeroNyaScarToJson))
    },
    nya_remember: async (root, args) =>
      JSON.stringify(
        aeroNyaScarToJson(await rememberAeroNya(root, rememberRequest(args), options))
      ),
    nya_check: async (root, args) =>
      JSON.stringify(await checkAeroNya(root, { base: stringArg(args, 'base') }, options))
  }
  return {
    handles: (name) => Object.hasOwn(handlers, name),
    call: async (name, args) => {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined
      if (!handler) {
        throw new Error(`unknown tool: ${name}`)
      }
      return handler(await resolveAeroNyaRepository(start), args)
    }
  }
}
