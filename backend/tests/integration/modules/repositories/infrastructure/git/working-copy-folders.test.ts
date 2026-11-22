import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyNotRemovedError } from '#repositories/infrastructure/errors/working-copy-not-removed.error';
import { WorkingCopyFolders } from '#repositories/infrastructure/git/working-copy-folders';
import {
  giveBackFolders,
  lockFolder,
  permissionsOf,
  plantLockedTree,
  plantOutside,
} from '#tests/support/locked-tree';

const SCAN = WorkingCopyId.fromPurpose('scan:1');

let folder: string;
let root: string;
let outside: string;
let folders: WorkingCopyFolders;

/** A copy of the id on disk: a tree with a file, and a git directory. */
function made(id: WorkingCopyId): { tree: string; gitDir: string } {
  const copy = folders.of(id);
  mkdirSync(join(copy.tree, 'src'), { recursive: true });
  writeFileSync(join(copy.tree, 'src/a.ts'), 'export const a = 1;\n');
  mkdirSync(join(copy.gitDir, 'objects'), { recursive: true });
  return copy;
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'copy-folders-'));
  root = join(folder, 'working-copies');
  outside = join(folder, 'outside');
  plantOutside(outside);
  folders = new WorkingCopyFolders(root);
});

afterEach(() => {
  giveBackFolders(folder);
  rmSync(folder, { recursive: true, force: true });
});

describe('WorkingCopyFolders', () => {
  describe('remove', () => {
    it('should remove a copy whose tree was locked, and follow no link out of it', async () => {
      const copy = made(SCAN);
      plantLockedTree(copy.tree, outside);

      await folders.remove(copy);

      expect(existsSync(copy.tree)).toBe(false);
      expect(existsSync(copy.gitDir)).toBe(false);
      expect(readdirSync(outside)).toEqual(['kept.txt']);
      expect(permissionsOf(outside)).toBe(0o555);
    });

    it('should not fail for a copy that is gone', async () => {
      await expect(folders.remove(folders.of(SCAN))).resolves.toBeUndefined();
    });

    describe('when the tree stays with the permissions in it given back', () => {
      it('should throw WorkingCopyNotRemovedError and still remove the git directory', async () => {
        const copy = made(SCAN);
        lockFolder(join(root, 'copies'));

        const removing = folders.remove(copy);

        await expect(removing).rejects.toThrow(WorkingCopyNotRemovedError);
        await expect(removing).rejects.toThrow(
          `The working copy in ${copy.tree} could not be removed: `,
        );
        await expect(removing).rejects.toMatchObject({ retryable: false });
        expect(existsSync(copy.tree)).toBe(true);
        expect(existsSync(copy.gitDir)).toBe(false);
      });
    });
  });
});
