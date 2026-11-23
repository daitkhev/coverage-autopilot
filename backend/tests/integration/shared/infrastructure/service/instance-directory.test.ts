import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnusableInstanceDirectoryError } from '#infrastructure/service/errors/unusable-instance-directory.error';
import { prepareInstanceDirectory } from '#infrastructure/service/instance-directory';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';

const PERMISSIONS = 0o777;

let instance: InstanceFolder;

function permissionsOf(path: string): number {
  return statSync(path).mode & PERMISSIONS;
}

beforeEach(() => {
  instance = createInstanceFolder();
});

afterEach(() => {
  instance.remove();
});

describe('prepareInstanceDirectory', () => {
  it('should make a missing directory and its folders for their owner only', () => {
    const { paths } = instance;

    prepareInstanceDirectory(paths);

    expect(
      [paths.directory, paths.artifacts, paths.workingCopies].map(
        permissionsOf,
      ),
    ).toEqual([0o700, 0o700, 0o700]);
  });

  describe('when the directory exists with wider rights', () => {
    it('should narrow it to its owner and keep what it holds', () => {
      const { paths } = instance;
      mkdirSync(paths.directory);
      chmodSync(paths.directory, 0o755);
      writeFileSync(join(paths.directory, 'notes.txt'), 'kept\n');

      prepareInstanceDirectory(paths);

      expect(permissionsOf(paths.directory)).toBe(0o700);
      expect(statSync(join(paths.directory, 'notes.txt')).size).toBe(5);
    });
  });

  describe('when it was prepared before', () => {
    it('should leave it as it is', () => {
      const { paths } = instance;
      prepareInstanceDirectory(paths);
      writeFileSync(paths.database, '');

      prepareInstanceDirectory(paths);

      expect(permissionsOf(paths.directory)).toBe(0o700);
      expect(statSync(paths.database).isFile()).toBe(true);
    });
  });

  describe('when a file is in its place', () => {
    it('should throw UnusableInstanceDirectoryError that names it', () => {
      const { paths } = instance;
      mkdirSync(join(paths.directory, '..'), { recursive: true });
      writeFileSync(paths.directory, 'not a directory\n');

      expect(() => {
        prepareInstanceDirectory(paths);
      }).toThrow(
        `The instance directory ${paths.directory} cannot be made and kept ` +
          'to its owner: Error: EEXIST',
      );
      expect(() => {
        prepareInstanceDirectory(paths);
      }).toThrow(UnusableInstanceDirectoryError);
    });
  });
});
