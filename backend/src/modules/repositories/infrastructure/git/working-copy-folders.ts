import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyMissingError } from '#repositories/infrastructure/errors/working-copy-missing.error';

/** The two folders of one copy. */
export interface CopyFolders {
  /** The files of the commit, which a sandbox may be lent and may write. */
  readonly tree: string;
  /** The repository of the copy, which only the service writes. */
  readonly gitDir: string;
}

/** The folder of the trees under the root of the working copies. */
const TREES = 'copies';

/** The folder of their git directories, beside the trees and in none. */
const GIT_DIRS = 'git-dirs';

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
    return {
      tree: join(this.trees, id.value),
      gitDir: join(this.gitDirs, id.value),
    };
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

  /** A link in the tree is removed, never followed. */
  public async remove(copy: CopyFolders): Promise<void> {
    await rm(copy.tree, { recursive: true, force: true });
    await rm(copy.gitDir, { recursive: true, force: true });
  }
}
