import { posix, relative, sep } from 'node:path';

import { realOf, workTreeOf } from '#harness/agents/work-tree';
import {
  type FrozenPolicy,
  isFrozen,
  readFrozenPolicy,
} from '#harness/shared/frozen';

/** An edit that must not go on by itself, and why. */
export interface HeldEdit {
  readonly reason: string;
  /**
   * True for a file in a tree that git linked to the first one. An agent
   * works there beside others with no person at hand, so nobody can be
   * asked.
   */
  readonly linked: boolean;
}

function heldFile(
  file: string,
  home: string,
  policy: FrozenPolicy,
): HeldEdit | undefined {
  const tree = workTreeOf(file, home);
  if (tree === undefined) {
    return undefined;
  }
  const path = relative(tree.root, realOf(file)).split(sep).join(posix.sep);
  return isFrozen(path, policy)
    ? {
        reason:
          `${path} is a file of the policy. A change of the policy ` +
          'lands on its own, and the owner decides it.',
        linked: tree.linked,
      }
    : undefined;
}

function firstHeld(
  files: readonly string[],
  home: string,
): HeldEdit | undefined {
  const policy = readFrozenPolicy();
  for (const file of files) {
    const held = heldFile(file, home, policy);
    if (held !== undefined) {
      return held;
    }
  }
  return undefined;
}

/**
 * Why an edit must wait for the owner, or nothing when it may go on. A
 * file is judged by its path in the tree that holds it, so the policy is
 * the policy in every tree of the repository. An agent names the files of
 * its edit in its own way, so the caller reads them. An edit that cannot
 * be read waits as well: a check that did not run has failed.
 */
export function heldEdit(
  home: string,
  editedFiles: () => readonly string[],
): HeldEdit | undefined {
  try {
    return firstHeld(editedFiles(), home);
  } catch (error) {
    return {
      reason: `The hook could not read the edit: ${String(error)}`,
      linked: false,
    };
  }
}
