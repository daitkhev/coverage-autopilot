import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  giveBackFolders,
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
