import { existsSync, type Stats } from 'node:fs';
import { chmod, lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyMissingError } from '#repositories/infrastructure/errors/working-copy-missing.error';
import { WorkingCopyNotRemovedError } from '#repositories/infrastructure/errors/working-copy-not-removed.error';

/** The two folders of one copy. */
export interface CopyFolders {
  /** The files of the commit, which a sandbox may be lent and may write. */
  readonly tree: string;
  /** The repository of the copy, which only the service writes. */
  readonly gitDir: string;
}

/** What a removal of every copy did. */
export interface CopiesSweep {
  /** How many copies are gone. */
  readonly removed: number;
  /** Why each of the others stays. */
  readonly left: readonly WorkingCopyNotRemovedError[];
}

/** The folder of the trees under the root of the working copies. */
const TREES = 'copies';

/** The folder of their git directories, beside the trees and in none. */
const GIT_DIRS = 'git-dirs';

/** A link in the tree is removed, never followed. */
const REMOVAL = { recursive: true, force: true } as const;

/** Enough for the owner to list a folder and empty it, and nothing more. */
const OWNER_ONLY = 0o700;

/** How a removal fails in a folder whose permissions were taken away. */
const REFUSED: ReadonlySet<string> = new Set(['EACCES', 'EPERM']);

const GONE = 'ENOENT';

function codeOf(error: unknown): string {
  return error instanceof Error && 'code' in error
    ? String(error.code)
    : 'unknown';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What `read` gives, or `gone` when its path is not there. */
async function unlessGone<Value>(
  read: () => Promise<Value>,
  gone: Value,
): Promise<Value> {
  try {
    return await read();
  } catch (error) {
    if (codeOf(error) === GONE) {
      return gone;
    }
    throw error;
  }
}

/**
 * Gives the owner back every folder of the tree, from the top down, so
 * each one can be listed and emptied. Only an entry that is a folder
 * itself is changed, by its own path: a link is never followed, wherever
 * it points.
 */
async function openUp(path: string): Promise<void> {
  const entry = await unlessGone<Stats | null>(async () => lstat(path), null);
  if (entry?.isDirectory() !== true) {
    return;
  }
  if ((entry.mode & OWNER_ONLY) !== OWNER_ONLY) {
    await chmod(path, OWNER_ONLY);
  }
  for (const name of await readdir(path)) {
    await openUp(join(path, name));
  }
}

/**
 * Removes a folder whatever permissions code that was lent it left in it.
 * The service owns every file of a copy, so it gives itself back what a
 * removal needs, and only once a removal was refused.
 */
async function removeFolder(path: string): Promise<void> {
  try {
    await rm(path, REMOVAL);
  } catch (error) {
    if (!REFUSED.has(codeOf(error))) {
      throw error;
    }
    await openUp(path);
    await rm(path, REMOVAL);
  }
}

/**
 * Both folders are tried, so a tree that stays does not keep its git
 * directory as well. `null` once both are gone.
 */
async function removalOf(
  copy: CopyFolders,
): Promise<WorkingCopyNotRemovedError | null> {
  const settled = await Promise.allSettled([
    removeFolder(copy.tree),
    removeFolder(copy.gitDir),
  ]);
  const causes = settled.flatMap((each): unknown[] =>
    each.status === 'rejected' ? [each.reason] : [],
  );
  if (causes.length === 0) {
    return null;
  }
  return new WorkingCopyNotRemovedError(
    `The working copy in ${copy.tree} could not be removed: ` +
      causes.map(messageOf).join(' '),
    { cause: causes[0] },
  );
}

/**
 * Where the working copies are. The git directory of a copy is not in its
 * tree, so code that was lent the tree can neither read it nor change
 * what git reads from it.
 */
export class WorkingCopyFolders {
  public readonly gitDirs: string;
  private readonly trees: string;

  public constructor(root: string) {
    this.trees = join(root, TREES);
    this.gitDirs = join(root, GIT_DIRS);
  }

  /** The folders of an id, whether they are there or not. */
  public of(id: WorkingCopyId): CopyFolders {
    return this.named(id.value);
  }

  /** The folders of a copy that was made and not disposed of. */
  public existing(id: WorkingCopyId): CopyFolders {
    const copy = this.of(id);
    if (!existsSync(copy.tree) || !existsSync(copy.gitDir)) {
      throw new WorkingCopyMissingError(
        `No working copy has the id "${id.value}".`,
      );
    }
    return copy;
  }

  /**
   * Throws `WorkingCopyNotRemovedError` when a folder stays even with the
   * permissions inside the copy given back.
   */
  public async remove(copy: CopyFolders): Promise<void> {
    const refusal = await removalOf(copy);
    if (refusal !== null) {
      throw refusal;
    }
  }

  /**
   * Removes every copy under the root, each one a tree and a git
   * directory, and leaves the mirrors.
   */
  public async removeAll(): Promise<CopiesSweep> {
    const names = new Set([
      ...(await unlessGone(async () => readdir(this.trees), [])),
      ...(await unlessGone(async () => readdir(this.gitDirs), [])),
    ]);
    const refusals = await Promise.all(
      [...names].map(async (name) => removalOf(this.named(name))),
    );
    const left = refusals.filter((refusal) => refusal !== null);
    return { removed: names.size - left.length, left };
  }

  private named(name: string): CopyFolders {
    return { tree: join(this.trees, name), gitDir: join(this.gitDirs, name) };
  }
}
