import {
  isDescendantOrEqual,
  isDescendantOrEqualAsync,
  normalizeExistingPath
} from '../../../filesystem/local-file-io/filesystem-path-containment'

export function hasRegisteredWorktreeRoot(targetPath: string, roots: Iterable<string>): boolean {
  for (const root of roots) {
    if (isDescendantOrEqual(targetPath, root)) {
      return true
    }
  }
  return false
}

export async function findRegisteredWorktreeRootAsync(
  targetPath: string,
  roots: Iterable<string>
): Promise<string | null> {
  let bestRoot: string | null = null
  for (const root of roots) {
    if (
      (!bestRoot || root.length > bestRoot.length) &&
      (await isDescendantOrEqualAsync(targetPath, root))
    ) {
      bestRoot = root
    }
  }
  return bestRoot
}

export async function findCanonicalRegisteredWorktreeRoot(
  targetPath: string,
  sourcePath: string,
  roots: Iterable<string>
): Promise<{ textualRoot: string; canonicalRoot: string } | null> {
  const textualRoot = await findRegisteredWorktreeRootAsync(sourcePath, roots)
  if (!textualRoot) {
    return null
  }
  const canonicalRoot = await normalizeExistingPath(textualRoot)
  return (await isDescendantOrEqualAsync(targetPath, canonicalRoot))
    ? { textualRoot, canonicalRoot }
    : null
}
