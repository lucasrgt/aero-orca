import { lstat, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/** The temp name `writeAeroGuardedFile` gives a board while it is written: `.<stem>.toml.tmp-<16 hex>`. */
const ORCA_BOARD_TEMP = /^\.[^\\/]+\.toml\.tmp-[0-9a-f]{16}$/
/** Older than this, no live writer still holds the temp (a write takes milliseconds). */
const STALE_TEMP_MS = 10 * 60 * 1000

/**
 * Removes the board temp files a crashed Orca writer left in `directory`. Only Orca's own pattern,
 * only regular files, only old ones: a concurrent writer's fresh temp survives. Best effort.
 */
export async function sweepStaleAeroKanbanTemps(
  directory: string,
  now: number = Date.now()
): Promise<void> {
  const names = await readdir(directory).catch(() => [])
  for (const name of names) {
    if (!ORCA_BOARD_TEMP.test(name)) {
      continue
    }
    const path = join(directory, name)
    const entry = await lstat(path).catch(() => null)
    if (entry?.isFile() && now - entry.mtimeMs > STALE_TEMP_MS) {
      await unlink(path).catch(() => {})
    }
  }
}
