import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Installed packages are many, and a patch never takes a file from them,
 * so their folder is not listed at any depth.
 */
const PACKAGES = 'node_modules';

/**
 * Every entry of a working copy that is not a folder, by its path in the
 * copy, with a stamp of its kind and permissions, its size and the time it
 * was changed.
 */
export type CopyListing = ReadonlyMap<string, string>;

/** What a run changed in a working copy. */
export interface CopyChanges {
  /** Whether an entry was added, changed or removed. */
  readonly any: boolean;
  /** The entries that were added or changed, sorted. */
  readonly written: readonly string[];
}

/** The entry itself and never what a link points to. */
async function stampOf(path: string): Promise<string> {
  const entry = await lstat(path, { bigint: true });
  return [entry.mode, entry.size, entry.mtimeNs].map(String).join(':');
}

function isListedFolder(entry: Dirent): boolean {
  return entry.isDirectory() && entry.name !== PACKAGES;
}

/**
 * Lists a working copy on the host. A link is an entry like a file: it is
 * stamped and never followed, so the listing never leaves the copy.
 */
export async function listCopy(root: string): Promise<CopyListing> {
  const listing = new Map<string, string>();
  const folders = [''];
  for (
    let folder = folders.pop();
    folder !== undefined;
    folder = folders.pop()
  ) {
    const entries = await readdir(join(root, folder), { withFileTypes: true });
    const pathOf = (entry: Dirent): string =>
      folder === '' ? entry.name : `${folder}/${entry.name}`;
    folders.push(...entries.filter(isListedFolder).map(pathOf));
    const paths = entries.filter((entry) => !entry.isDirectory()).map(pathOf);
    const stamped = await Promise.all(
      paths.map(
        async (path) => [path, await stampOf(join(root, path))] as const,
      ),
    );
    for (const [path, stamp] of stamped) {
      listing.set(path, stamp);
    }
  }
  return listing;
}

/** What changed between two listings of the same working copy. */
export function changesBetween(
  before: CopyListing,
  after: CopyListing,
): CopyChanges {
  const written = [...after]
    .filter(([path, stamp]) => before.get(path) !== stamp)
    .map(([path]) => path)
    .sort();
  const removed = [...before.keys()].some((path) => !after.has(path));
  return { any: written.length > 0 || removed, written };
}
