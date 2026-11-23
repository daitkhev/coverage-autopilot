import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** Nobody may read, write or enter. */
const NOTHING = 0o000;

/** Read and enter, but not write: what a folder holds stays. */
const READ_ONLY = 0o555;

/** Everything for the owner, nothing for anyone else. */
const OWNER_ONLY = 0o700;

/** The bits of a mode that say who may read, write and enter. */
const PERMISSIONS = 0o777;

/**
 * Plants in `tree` what code that was lent it can leave: a folder nobody
 * may enter with another one in it, a folder nobody may write, a file
 * nobody may read, and two links to `outside`, one at the top and one in
 * the folder nobody may enter.
 */
export function plantLockedTree(tree: string, outside: string): void {
  mkdirSync(join(tree, 'sealed/deep'), { recursive: true });
  writeFileSync(join(tree, 'sealed/deep/a.txt'), 'a');
  symlinkSync(outside, join(tree, 'sealed/out'));
  mkdirSync(join(tree, 'frozen'));
  writeFileSync(join(tree, 'frozen/b.txt'), 'b');
  writeFileSync(join(tree, 'unreadable.txt'), 'c');
  symlinkSync(outside, join(tree, 'out'));
  chmodSync(join(tree, 'unreadable.txt'), NOTHING);
  chmodSync(join(tree, 'sealed/deep'), NOTHING);
  chmodSync(join(tree, 'sealed'), NOTHING);
  chmodSync(join(tree, 'frozen'), READ_ONLY);
}

/**
 * A folder outside any tree, which only its owner may read and enter and
 * nobody may write, with a file in it. A removal that followed a link
 * into it would change its mode or empty it.
 */
export function plantOutside(folder: string): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'kept.txt'), 'kept');
  chmodSync(folder, READ_ONLY);
}

/** Takes away the write permission of a folder, so nothing in it goes. */
export function lockFolder(folder: string): void {
  chmodSync(folder, READ_ONLY);
}

/** The bits of the mode of a path that say who may do what. */
export function permissionsOf(path: string): number {
  return statSync(path).mode & PERMISSIONS;
}

/**
 * Gives the owner back every folder under `root`, `root` included, and
 * never through a link, so that a test can remove what it made whatever
 * state it ended in. A path that is not there is left alone.
 */
export function giveBackFolders(root: string): void {
  const entry = lstatSync(root, { throwIfNoEntry: false });
  if (entry?.isDirectory() !== true) {
    return;
  }
  chmodSync(root, OWNER_ONLY);
  for (const name of readdirSync(root)) {
    giveBackFolders(join(root, name));
  }
}
