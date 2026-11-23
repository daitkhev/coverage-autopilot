import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

/**
 * The root of a working copy as given and as the file system resolves it,
 * the longer first. A runner reports the resolved path, such as
 * `/private/var` for `/var` on macOS, and a text in which the shorter
 * were replaced first would keep `/private`.
 */
export function rootsOf(workingCopyPath: string): string[] {
  const roots = new Set([realpathSync(workingCopyPath), workingCopyPath]);
  return [...roots].sort((first, second) => second.length - first.length);
}

/** The path relative to the working copy, or `null` for one outside it. */
export function insideOf(
  roots: readonly string[],
  path: string,
): string | null {
  const inside = roots
    .map((root) => relative(root, path))
    .find((rest) => rest !== '' && !rest.startsWith('..') && !isAbsolute(rest));
  return inside ?? null;
}
