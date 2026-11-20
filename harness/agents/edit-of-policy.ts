import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, posix, relative, sep } from 'node:path';

import { isFrozen, readFrozenPolicy } from '#harness/shared/frozen';

/** The start of a path that leaves the folder it is counted from. */
const OUTSIDE = '..';

/** Where a path really is. A file that does not exist yet has no link. */
function realOf(path: string): string {
  return existsSync(path)
    ? realpathSync(path)
    : join(realOf(dirname(path)), basename(path));
}

/** The path from the root of the tree, or nothing for a file outside it. */
function inTree(path: string, root: string): string | undefined {
  const fromRoot = relative(realpathSync(root), realOf(path));
  const outside = fromRoot === OUTSIDE || fromRoot.startsWith(OUTSIDE + sep);
  return outside ? undefined : fromRoot.split(sep).join(posix.sep);
}

function firstFrozen(
  files: readonly string[],
  root: string,
): string | undefined {
  const policy = readFrozenPolicy();
  return files
    .map((file) => inTree(file, root))
    .find((path) => path !== undefined && isFrozen(path, policy));
}

/**
 * Why an edit must wait for the owner, or nothing when it may go on. An
 * agent names the files of its edit in its own way, so the caller reads
 * them. An edit that cannot be read waits as well: a check that did not
 * run has failed.
 */
export function reasonToAsk(
  root: string,
  editedFiles: () => readonly string[],
): string | undefined {
  try {
    const path = firstFrozen(editedFiles(), root);
    return path === undefined
      ? undefined
      : `${path} is a file of the policy. A change of the policy ` +
          'lands on its own, and the owner decides it.';
  } catch (error) {
    return `The hook could not read the edit: ${String(error)}`;
  }
}
