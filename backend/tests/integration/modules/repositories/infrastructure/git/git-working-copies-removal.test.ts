import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  giveBackFolders,
  lockFolder,
  plantLockedTree,
  plantOutside,
} from '#tests/support/locked-tree';
import { COPY, WorkingCopyFixture } from '#tests/support/working-copy-fixture';

let fixture: WorkingCopyFixture;
let outside: string;

beforeEach(() => {
  fixture = new WorkingCopyFixture();
  outside = join(fixture.host.folder, 'outside');
  plantOutside(outside);
});

afterEach(() => {
  giveBackFolders(fixture.host.folder);
  fixture.remove();
});

describe('GitWorkingCopies', () => {
  describe('dispose', () => {
    it('should remove a copy whose tree its sandbox locked, through no link', async () => {
      plantLockedTree(await fixture.created(), outside);

      await fixture.copies.dispose(COPY);

      expect(existsSync(fixture.pathOf())).toBe(false);
      expect(existsSync(fixture.gitDirOf())).toBe(false);
      expect(readdirSync(outside)).toEqual(['kept.txt']);
      expect(fixture.logger.lines).toEqual([]);
    });

    describe('when the copy stays with the permissions in it given back', () => {
      it('should not fail, and say in the log which copy stays and why', async () => {
        await fixture.created();
        lockFolder(dirname(fixture.pathOf()));

        await expect(fixture.copies.dispose(COPY)).resolves.toBeUndefined();

        expect(existsSync(fixture.pathOf())).toBe(true);
        expect(fixture.logger.at('error')).toEqual([
          {
            level: 'error',
            message:
              'A working copy could not be removed, so its folders stay on disk.',
            fields: {
              component: 'working-copies',
              workingCopyId: COPY.value,
              errorCode: 'working_copy_not_removed',
              errorMessage: expect.stringContaining(
                fixture.pathOf(),
              ) as unknown,
            },
          },
        ]);
      });
    });
  });

  describe('create', () => {
    it('should make the copy anew in place of a locked one an earlier try left', async () => {
      plantLockedTree(await fixture.created(), outside);

      const path = await fixture.created();

      expect(readdirSync(path).sort()).toEqual(['.gitignore', 'src']);
      expect(readFileSync(join(path, 'src/a.ts'), 'utf8')).toBe(
        'export const a = 1;\n',
      );
      expect(readdirSync(outside)).toEqual(['kept.txt']);
    });
  });
});
