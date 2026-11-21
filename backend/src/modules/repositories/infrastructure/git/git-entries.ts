import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Code points a file system may leave out when it compares names, so a
 * name with one of them can open as `.git` there.
 */
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

const GIT = '.git';

/** Also in another case, which a file system that ignores case opens alike. */
function isGit(name: string): boolean {
  return name.replace(IGNORABLE, '').toLowerCase() === GIT;
}

/**
 * Every entry of the tree, at any depth and of any kind, that git would
 * take for a repository or for a pointer to one, as paths in the tree.
 * A link is not followed, so the walk never leaves the tree.
 */
export async function gitEntriesIn(tree: string): Promise<string[]> {
  const found: string[] = [];
  const folders = [tree];
  for (
    let folder = folders.pop();
    folder !== undefined;
    folder = folders.pop()
  ) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (isGit(entry.name)) {
        found.push(relative(tree, path));
      } else if (entry.isDirectory()) {
        folders.push(path);
      }
    }
  }
  return found;
}
