import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildAeroKnowledgeIndex,
  type AeroKnowledgeIndex
} from '../../shared/aero/aero-knowledge-index'
import { parseAeroKnowledgeItem } from '../../shared/aero/aero-knowledge-item'
import type { AeroIssue } from '../../shared/aero/aero-workspace-snapshot'
import {
  listFiles,
  parseFiles,
  probeDirectory,
  toRepoRelativePath
} from '../../main/aero/aero-workspace-files'

export type AeroKnowledgeCorpus = { index: AeroKnowledgeIndex; issues: AeroIssue[]; readAt: Date }

export type AeroKnowledgeCorpusReader = {
  read: () => Promise<AeroKnowledgeCorpus>
  /** Drops the cache so the next read re-parses; the mtime check alone can miss a same-tick write. */
  invalidate: () => void
}

async function itemsFingerprint(root: string, files: readonly string[]): Promise<string> {
  const stats = await Promise.all(
    files.map(async (file) => {
      const entry = await lstat(file).catch(() => null)
      return `${toRepoRelativePath(root, file)}:${entry?.size ?? -1}:${entry?.mtimeMs ?? -1}`
    })
  )
  return stats.join('\n')
}

/** Parses `.aerofortress/items` into an index, re-reading only when a file's size or mtime changed. */
export function createAeroKnowledgeCorpusReader(root: string): AeroKnowledgeCorpusReader {
  const itemsDirectory = join(root, '.aerofortress', 'items')
  let cached: { fingerprint: string; corpus: AeroKnowledgeCorpus } | null = null
  return {
    invalidate: () => {
      cached = null
    },
    read: async () => {
      const issues: AeroIssue[] = []
      const files =
        (await probeDirectory(root, join(root, '.aerofortress'))).status === 'ok'
          ? await listFiles(root, itemsDirectory, '.md', true, issues)
          : []
      const fingerprint = await itemsFingerprint(root, files)
      if (cached?.fingerprint === fingerprint) {
        return cached.corpus
      }
      const readAt = new Date()
      const items = await parseFiles(
        root,
        files,
        (raw, path) => parseAeroKnowledgeItem(raw, path, readAt),
        issues
      )
      const corpus = { index: buildAeroKnowledgeIndex(items), issues, readAt }
      cached = { fingerprint, corpus }
      return corpus
    }
  }
}
