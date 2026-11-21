import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { HarnessError } from '#harness/shared/harness.error';

/** What git is asked of a folder: its tree, and where its history is. */
const PLACE = [
  'rev-parse',
  '--path-format=absolute',
  '--show-toplevel',
  '--git-dir',
  '--git-common-dir',
];

/**
 * A tree of the repository. The first one holds the history. Git can link
 * more trees to it, one for each branch that is worked on at the same
 * time, and an agent that works beside others gets such a tree.
 */
export interface WorkTree {
  /** The real path of the root of the tree. */
  readonly root: string;
  /** True for a tree that git linked to the first one. */
  readonly linked: boolean;
}

interface Place {
  readonly root: string;
  readonly ownHistory: string;
  readonly sharedHistory: string;
}

/** Where a path really is. A file that does not exist yet has no link. */
export function realOf(path: string): string {
  return existsSync(path)
    ? realpathSync(path)
    : join(realOf(dirname(path)), basename(path));
}

/** What git says of a folder, or nothing when no tree holds it. */
function placeOf(folder: string): Place | undefined {
  const result = spawnSync('git', PLACE, { cwd: folder, encoding: 'utf8' });
  if (result.status !== 0) {
    return undefined;
  }
  const [root = '', ownHistory = '', sharedHistory = ''] =
    result.stdout.split('\n');
  return {
    root: realpathSync(root),
    ownHistory: realpathSync(ownHistory),
    sharedHistory: realpathSync(sharedHistory),
  };
}

/**
 * The tree of this repository that holds a folder, or nothing for a
 * folder outside it. A tree of another repository is outside too, and so
 * is the folder git keeps its own files in. The repository is named by
 * any folder of it.
 */
export function workTreeAt(folder: string, home: string): WorkTree | undefined {
  const own = placeOf(home);
  if (own === undefined) {
    throw new HarnessError(`${home} is not in a tree of git.`);
  }
  const place = existsSync(folder) ? placeOf(folder) : undefined;
  if (place?.sharedHistory !== own.sharedHistory) {
    return undefined;
  }
  return {
    root: place.root,
    linked: place.ownHistory !== place.sharedHistory,
  };
}

/** The nearest folder above a path that is there. The root always is. */
function existingFolderOf(path: string): string {
  const folder = dirname(path);
  return existsSync(folder) ? folder : existingFolderOf(folder);
}

/** The tree of this repository that holds a file, written or not yet. */
export function workTreeOf(file: string, home: string): WorkTree | undefined {
  return workTreeAt(existingFolderOf(realOf(file)), home);
}
