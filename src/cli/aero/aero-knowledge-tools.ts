import { randomUUID } from 'node:crypto'
import { basename, join, posix } from 'node:path'
import {
  aeroItemStoragePath,
  createAeroItemRecord,
  linkAeroItemRecord,
  updateAeroItemRecord,
  validateAeroItemRecord,
  type AeroStoreInput
} from '../../shared/aero/aero-knowledge-edits'
import { exploreAeroKnowledge } from '../../shared/aero/aero-knowledge-explore'
import { describeAeroKnowledgeHealth } from '../../shared/aero/aero-knowledge-health'
import type { AeroKnowledgeItem } from '../../shared/aero/aero-knowledge-item'
import { packAeroKnowledge } from '../../shared/aero/aero-knowledge-pack'
import { queryAeroKnowledge } from '../../shared/aero/aero-knowledge-query'
import { compactAeroQueryHit, readAeroKnowledgeItem } from '../../shared/aero/aero-knowledge-views'
import {
  renderAeroKnowledgeItem,
  toAeroItemRecord,
  type AeroItemRecord
} from '../../shared/aero/aero-item-serializer'
import { removeAeroItemFile, writeAeroItemFile } from './aero-item-file-writer'
import { createAeroKnowledgeCorpusReader } from './aero-knowledge-corpus'

type ToolArgs = Record<string, unknown>

const DEFAULT_QUERY_LIMIT = 8
const MAX_QUERY_LIMIT = 40
const DEFAULT_PACK_BUDGET_TOKENS = 2000
const MAX_PACK_BUDGET_TOKENS = 20_000
const ITEMS_PREFIX = '.aerofortress/items/'

export type AeroKnowledgeTools = {
  call: (name: string, args: ToolArgs) => Promise<string>
}

function stringArg(args: ToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function requiredString(args: ToolArgs, key: string): string {
  const value = stringArg(args, key)
  if (value === undefined) {
    throw new Error(`${key} is required`)
  }
  return value
}

/** serde's `as_u64`: only a non-negative whole number counts, anything else falls back. */
function countArg(args: ToolArgs, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined
}

function storeInput(args: ToolArgs): AeroStoreInput {
  return {
    slug: requiredString(args, 'slug'),
    type: requiredString(args, 'type'),
    title: requiredString(args, 'title'),
    body: requiredString(args, 'body'),
    tags: stringList(args.tags) ?? [],
    provenance: requiredString(args, 'provenance'),
    evidence: stringArg(args, 'evidence'),
    decay: stringArg(args, 'decay')
  }
}

/** `.aerofortress/items/<folders>/<file>` as the folder segments and file name the writer wants. */
function locateStoredItem(item: AeroKnowledgeItem): { folders: string[]; fileName: string } {
  if (!item.path.startsWith(ITEMS_PREFIX)) {
    throw new Error(`${item.path} is outside ${ITEMS_PREFIX}`)
  }
  const folder = posix.dirname(item.path.slice(ITEMS_PREFIX.length))
  return {
    folders: folder === '.' ? [] : folder.split('/'),
    fileName: posix.basename(item.path)
  }
}

function missingItem(id: string): Error {
  return new Error(`item não encontrado: ${id}`)
}

export function createAeroKnowledgeTools(root: string): AeroKnowledgeTools {
  const corpus = createAeroKnowledgeCorpusReader(root)
  let writes: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = writes.then(task, task)
    writes = run.catch(() => {})
    return run
  }
  const rewrite = async (item: AeroKnowledgeItem, record: AeroItemRecord): Promise<void> => {
    const { folders, fileName } = locateStoredItem(item)
    await writeAeroItemFile(root, folders, fileName, renderAeroKnowledgeItem(record), 'replace')
    corpus.invalidate()
  }

  const store = async (args: ToolArgs): Promise<string> => {
    const input = storeInput(args)
    const id = stringArg(args, 'id')
    const { index } = await corpus.read()
    const now = new Date()
    const existing = id === undefined ? undefined : index.byId.get(id)
    if (id !== undefined && !existing) {
      throw missingItem(id)
    }
    const record = existing
      ? updateAeroItemRecord(toAeroItemRecord(existing), input, now)
      : createAeroItemRecord(input, randomUUID(), now)
    const { folders, fileName } = aeroItemStoragePath(record)
    await writeAeroItemFile(
      root,
      folders,
      fileName,
      renderAeroKnowledgeItem(record),
      existing ? 'replace' : 'create'
    )
    if (existing) {
      const previous = join(root, ...existing.path.split('/'))
      if (previous !== join(root, '.aerofortress', 'items', ...folders, fileName)) {
        await removeAeroItemFile(root, previous)
      }
    }
    corpus.invalidate()
    return JSON.stringify({ ok: true, id: record.id, workspace: basename(root) })
  }

  const link = async (args: ToolArgs): Promise<string> => {
    const from = requiredString(args, 'from')
    const to = requiredString(args, 'to')
    const kind = requiredString(args, 'kind')
    const item = (await corpus.read()).index.byId.get(from)
    if (!item) {
      throw missingItem(from)
    }
    const linked = linkAeroItemRecord(toAeroItemRecord(item), kind, to, new Date())
    if (linked.links.length !== item.links.length) {
      await rewrite(item, linked)
    }
    return JSON.stringify({ ok: true })
  }

  const validate = async (args: ToolArgs): Promise<string> => {
    const id = requiredString(args, 'id')
    const item = (await corpus.read()).index.byId.get(id)
    if (!item) {
      throw missingItem(id)
    }
    await rewrite(item, validateAeroItemRecord(toAeroItemRecord(item), new Date()))
    return JSON.stringify({ ok: true })
  }

  const query = async (args: ToolArgs): Promise<string> => {
    const { index } = await corpus.read()
    const now = new Date()
    const hits = queryAeroKnowledge(
      index,
      {
        q: stringArg(args, 'q'),
        slug: stringArg(args, 'slug'),
        tag: stringArg(args, 'tag'),
        limit: Math.min(countArg(args, 'limit', DEFAULT_QUERY_LIMIT), MAX_QUERY_LIMIT)
      },
      now
    )
    return JSON.stringify(
      hits.map((hit) => compactAeroQueryHit(hit, now)),
      null,
      2
    )
  }

  const explore = async (args: ToolArgs): Promise<string> => {
    const { index } = await corpus.read()
    const q = stringArg(args, 'q')?.trim()
    const now = new Date()
    return q
      ? exploreAeroKnowledge(index, q, countArg(args, 'budget_tokens', 0), now)
      : describeAeroKnowledgeHealth(index, now)
  }

  const read = async (args: ToolArgs): Promise<string> => {
    const id = requiredString(args, 'id')
    const item = readAeroKnowledgeItem((await corpus.read()).index, id, new Date())
    if (!item) {
      throw new Error(`item not found: ${id}`)
    }
    return JSON.stringify(item, null, 2)
  }

  const pack = async (args: ToolArgs): Promise<string> => {
    const { index } = await corpus.read()
    const budget = Math.min(
      countArg(args, 'budget_tokens', DEFAULT_PACK_BUDGET_TOKENS),
      MAX_PACK_BUDGET_TOKENS
    )
    const packed = packAeroKnowledge(index, stringList(args.slugs), budget, new Date())
    return packed.length > 0 ? packed : '(network empty for this filter)'
  }

  const handlers: Record<string, (args: ToolArgs) => Promise<string>> = {
    store: (args) => exclusive(() => store(args)),
    link: (args) => exclusive(() => link(args)),
    validate: (args) => exclusive(() => validate(args)),
    query,
    explore,
    read,
    pack
  }
  return {
    call: (name, args) => {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined
      return handler ? handler(args) : Promise.reject(new Error(`unknown tool: ${name}`))
    }
  }
}
