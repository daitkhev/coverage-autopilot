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
const ATTEMPT = WorkingCopyId.fromPurpose('improvement:1:attempt:2');

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

  describe('removeAll', () => {
    it('should remove every copy, locked or not, and leave the mirrors', async () => {
      plantLockedTree(made(SCAN).tree, outside);
      made(ATTEMPT);
      mkdirSync(join(root, 'git-dirs', 'half-made'), { recursive: true });
      mkdirSync(join(root, 'mirrors', 'widgets.git'), { recursive: true });

      const sweep = await folders.removeAll();

      expect(sweep).toEqual({ removed: 3, left: [] });
      expect(readdirSync(join(root, 'copies'))).toEqual([]);
      expect(readdirSync(join(root, 'git-dirs'))).toEqual([]);
      expect(readdirSync(join(root, 'mirrors'))).toEqual(['widgets.git']);
      expect(readdirSync(outside)).toEqual(['kept.txt']);
    });

    it('should find nothing under a root where no copy was made', async () => {
      expect(await folders.removeAll()).toEqual({ removed: 0, left: [] });
    });

    describe('when a copy stays', () => {
      it('should remove the others and say why that one stays', async () => {
        const copy = made(SCAN);
        mkdirSync(join(root, 'git-dirs', 'half-made'));
        lockFolder(join(root, 'copies'));

        const sweep = await folders.removeAll();

        expect(sweep.removed).toBe(1);
        expect(sweep.left.map((left) => left.message)).toEqual([
          expect.stringContaining(
            `The working copy in ${copy.tree} could not be removed: `,
          ),
        ]);
        expect(readdirSync(join(root, 'git-dirs'))).toEqual([]);
      });
    });
  });
});
