import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidMigrationFileError } from '#infrastructure/database/errors/invalid-migration-file.error';
import { readMigrations } from '#infrastructure/database/migration-files';

let folder: string;

function write(...files: string[]): void {
  for (const file of files) {
    writeFileSync(join(folder, file), `-- ${file}`);
  }
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'migrations-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('readMigrations', () => {
  it('should give the files in the order of their numbers', () => {
    write('0002-add-b.sql', '0001-add-a.sql', '0010-add-j.sql');
    write(...[3, 4, 5, 6, 7, 8, 9].map((n) => `000${String(n)}-add-x.sql`));

    const migrations = readMigrations(folder);

    expect(migrations.map((migration) => migration.name).slice(0, 2)).toEqual([
      '0001-add-a.sql',
      '0002-add-b.sql',
    ]);
    expect(migrations.at(-1)).toEqual({
      version: 10,
      name: '0010-add-j.sql',
      sql: '-- 0010-add-j.sql',
    });
  });

  it('should leave out hidden files of the system', () => {
    write('0001-add-a.sql', '.DS_Store');

    expect(readMigrations(folder)).toHaveLength(1);
  });

  describe('when the folder holds no migration', () => {
    it('should throw InvalidMigrationFileError, also with hidden files only', () => {
      write('.DS_Store');

      expect(() => readMigrations(folder)).toThrow(
        new InvalidMigrationFileError(
          `${folder} holds no migration. The versions start at 1.`,
        ),
      );
    });
  });

  describe('when a file is not named as a migration', () => {
    it.each(['0001-Add-A.sql', '1-add-a.sql', '0001_add_a.sql', '0001.sql'])(
      'should throw InvalidMigrationFileError for %s',
      (file) => {
        write(file);

        expect(() => readMigrations(folder)).toThrow(
          new InvalidMigrationFileError(
            `${file} is not named <four digits>-<kebab-case words>.sql.`,
          ),
        );
      },
    );
  });

  describe('when the numbers have a gap', () => {
    it('should throw InvalidMigrationFileError', () => {
      write('0001-add-a.sql', '0003-add-c.sql');

      expect(() => readMigrations(folder)).toThrow(
        new InvalidMigrationFileError(
          '0003-add-c.sql has version 3, and the next version is 2. ' +
            'The versions start at 1 and have no gaps.',
        ),
      );
    });

    it('should throw InvalidMigrationFileError for a number used twice', () => {
      write('0001-add-a.sql', '0001-add-b.sql');

      expect(() => readMigrations(folder)).toThrow(InvalidMigrationFileError);
    });
  });
});
