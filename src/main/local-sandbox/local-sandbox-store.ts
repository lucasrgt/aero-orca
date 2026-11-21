import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  LOCAL_SANDBOX_GEOMETRIES,
  type LocalSandboxRecord
} from '../../shared/local-sandbox/local-sandbox-types'

const STORE_FILENAME = 'local-sandboxes.json'

const LocalSandboxRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  environmentId: z.string().min(1),
  containerName: z.string().min(1),
  volumeName: z.string().min(1),
  orcadPort: z.number().int().min(1).max(65_535),
  novncPort: z.number().int().min(1).max(65_535),
  vncPort: z.number().int().min(1).max(65_535),
  geometry: z.enum(LOCAL_SANDBOX_GEOMETRIES),
  shareHostAgents: z.boolean(),
  createdAt: z.number().finite()
})

const LocalSandboxStoreSchema = z.object({
  version: z.literal(1),
  sandboxes: z.array(LocalSandboxRecordSchema)
})

function storePath(userDataPath: string): string {
  return join(userDataPath, STORE_FILENAME)
}

export async function readLocalSandboxRecords(userDataPath: string): Promise<LocalSandboxRecord[]> {
  try {
    const raw = await readFile(storePath(userDataPath), 'utf8')
    const parsed = LocalSandboxStoreSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.sandboxes : []
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function writeLocalSandboxRecords(
  userDataPath: string,
  sandboxes: readonly LocalSandboxRecord[]
): Promise<void> {
  const target = storePath(userDataPath)
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.${String(process.pid)}.${String(Date.now())}.tmp`
  await writeFile(tmp, `${JSON.stringify({ version: 1, sandboxes }, null, 2)}\n`, 'utf8')
  await rename(tmp, target)
}

export async function upsertLocalSandboxRecord(
  userDataPath: string,
  record: LocalSandboxRecord
): Promise<void> {
  const existing = await readLocalSandboxRecords(userDataPath)
  const next = [...existing.filter((entry) => entry.id !== record.id), record]
  await writeLocalSandboxRecords(userDataPath, next)
}

export async function removeLocalSandboxRecord(
  userDataPath: string,
  id: string
): Promise<LocalSandboxRecord | null> {
  const existing = await readLocalSandboxRecords(userDataPath)
  const removed = existing.find((entry) => entry.id === id) ?? null
  if (!removed) {
    return null
  }
  await writeLocalSandboxRecords(
    userDataPath,
    existing.filter((entry) => entry.id !== id)
  )
  return removed
}

export async function findLocalSandboxByEnvironmentId(
  userDataPath: string,
  environmentId: string
): Promise<LocalSandboxRecord | null> {
  const existing = await readLocalSandboxRecords(userDataPath)
  return existing.find((entry) => entry.environmentId === environmentId) ?? null
}
