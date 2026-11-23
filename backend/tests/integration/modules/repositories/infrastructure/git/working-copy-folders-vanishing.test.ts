import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyFolders } from '#repositories/infrastructure/git/working-copy-folders';
import { giveBackFolders, lockFolder } from '#tests/support/locked-tree';

const SCAN = WorkingCopyId.fromPurpose('scan:1');

/** The folder that goes just before the removal lists it. */
const race = vi.hoisted(() => ({ vanishing: '' }));

/**
 * A removal that was refused goes on removing after it failed, so a
 * folder of the tree may go between the look at it and its listing, when
 * the scheduler says so. Here the listing of the folder the test names
 * takes it first, as the rest of the refused removal would, every time.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      if (args[0] === race.vanishing) {
        await actual.rm(race.vanishing, { recursive: true, force: true });
      }
      return actual.readdir(...args);
    },
  };
});

let folder: string;
let folders: WorkingCopyFolders;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'copy-vanishing-'));
  folders = new WorkingCopyFolders(join(folder, 'working-copies'));
});

afterEach(() => {
  race.vanishing = '';
  giveBackFolders(folder);
  rmSync(folder, { recursive: true, force: true });
});

describe('WorkingCopyFolders', () => {
  describe('when a folder of a refused tree goes while the removal opens it up', () => {
    it('should remove the copy all the same', async () => {
      const copy = folders.of(SCAN);
      const frozen = join(copy.tree, 'frozen');
      mkdirSync(frozen, { recursive: true });
      writeFileSync(join(frozen, 'b.txt'), 'b');
      mkdirSync(copy.gitDir, { recursive: true });
      lockFolder(frozen);
      race.vanishing = frozen;

      await folders.remove(copy);

      expect(existsSync(copy.tree)).toBe(false);
      expect(existsSync(copy.gitDir)).toBe(false);
    });
  });
});
