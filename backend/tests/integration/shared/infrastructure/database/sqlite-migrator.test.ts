import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseTooNewError } from '#infrastructure/database/errors/database-too-new.error';
import { MigrationFailedError } from '#infrastructure/database/errors/migration-failed.error';
import type { Migration } from '#infrastructure/database/migration-files';
import { migrateDatabase } from '#infrastructure/database/sqlite-migrator';
import {
  createEmptyDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const FIRST: Migration = {
  version: 1,
  name: '0001-add-parents.sql',
  sql: `
    CREATE TABLE parents (id INTEGER PRIMARY KEY) STRICT;
    CREATE TABLE children (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES parents (id)
    ) STRICT;
    INSERT INTO parents (id) VALUES (1);
    INSERT INTO children (id, parent_id) VALUES (1, 1);
  `,
};

const second = (sql: string): Migration => ({
  version: 2,
  name: '0002-change.sql',
  sql,
});

let database: TemporaryDatabase;

function value(sql: string): unknown {
  const row = database.connection.prepare(sql).get();
  return row === undefined ? undefined : Object.values(row)[0];
}

function tables(): unknown[] {
  return database.connection
    .prepare("SELECT name FROM pragma_table_list WHERE schema = 'main'")
    .all()
    .map((row) => row['name'])
    .filter((name) => !String(name).startsWith('sqlite_'));
}

function expectUntouchedAtVersion(version: number): void {
  expect(value('PRAGMA user_version')).toBe(version);
  expect(value('PRAGMA foreign_keys')).toBe(1);
  expect(database.connection.isTransaction).toBe(false);
}

beforeEach(() => {
  database = createEmptyDatabase();
});

afterEach(() => {
  database.remove();
});

describe('migrateDatabase', () => {
  it('should bring an empty database to the last version', () => {
    const report = migrateDatabase(database.connection, [
      FIRST,
      second('INSERT INTO parents (id) VALUES (2);'),
    ]);

    expect(report).toEqual({ from: 0, to: 2 });
    expect(value('SELECT count(*) FROM parents')).toBe(2);
    expectUntouchedAtVersion(2);
  });

  it('should leave an empty database at version 0 with no migrations', () => {
    expect(migrateDatabase(database.connection, [])).toEqual({
      from: 0,
      to: 0,
    });
  });

  it('should apply nothing to a database that is up to date', () => {
    migrateDatabase(database.connection, [FIRST]);

    expect(migrateDatabase(database.connection, [FIRST])).toEqual({
      from: 1,
      to: 1,
    });
  });

  it('should apply only the migrations that are missing', () => {
    migrateDatabase(database.connection, [FIRST]);

    const report = migrateDatabase(database.connection, [
      { ...FIRST, sql: 'SELECT missing_function()' },
      second('INSERT INTO parents (id) VALUES (2);'),
    ]);

    expect(report).toEqual({ from: 1, to: 2 });
    expect(value('SELECT count(*) FROM parents')).toBe(2);
  });

  it('should build again a table that others refer to, with its rows', () => {
    migrateDatabase(database.connection, [FIRST]);

    migrateDatabase(database.connection, [
      FIRST,
      second(`
        CREATE TABLE parents_next (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'none'
        ) STRICT;
        INSERT INTO parents_next (id) SELECT id FROM parents;
        DROP TABLE parents;
        ALTER TABLE parents_next RENAME TO parents;
      `),
    ]);

    expect(value('SELECT name FROM parents WHERE id = 1')).toBe('none');
    expect(() => {
      database.connection.exec('INSERT INTO children VALUES (2, 99)');
    }).toThrow('FOREIGN KEY constraint failed');
    expectUntouchedAtVersion(2);
  });

  describe('when the database is newer than the service', () => {
    it('should throw DatabaseTooNewError and change nothing', () => {
      migrateDatabase(database.connection, [FIRST, second('SELECT 1')]);

      expect(() => migrateDatabase(database.connection, [FIRST])).toThrow(
        new DatabaseTooNewError(
          'The database is at version 2, and this service knows versions ' +
            'up to 1. Start the newer service.',
        ),
      );
      expectUntouchedAtVersion(2);
    });
  });

  describe('when a statement of a migration fails', () => {
    it('should roll the whole migration back', () => {
      migrateDatabase(database.connection, [FIRST]);

      expect(() =>
        migrateDatabase(database.connection, [
          FIRST,
          second(`
            CREATE TABLE extra (id INTEGER) STRICT;
            INSERT INTO nowhere VALUES (1);
          `),
        ]),
      ).toThrow(
        new MigrationFailedError(
          '0002-change.sql: Error: no such table: nowhere',
        ),
      );
      expect(tables()).not.toContain('extra');
      expectUntouchedAtVersion(1);
    });

    it('should refuse VACUUM, which cannot be rolled back', () => {
      migrateDatabase(database.connection, [FIRST]);

      expect(() =>
        migrateDatabase(database.connection, [FIRST, second('VACUUM;')]),
      ).toThrow(MigrationFailedError);
      expectUntouchedAtVersion(1);
    });
  });

  describe('when a migration leaves a row without the row it refers to', () => {
    it('should roll the migration back', () => {
      migrateDatabase(database.connection, [FIRST]);

      expect(() =>
        migrateDatabase(database.connection, [
          FIRST,
          second('INSERT INTO children (id, parent_id) VALUES (2, 99);'),
        ]),
      ).toThrow(
        new MigrationFailedError(
          '0002-change.sql: row 2 of children refers to a missing row of ' +
            'parents.',
        ),
      );
      expect(value('SELECT count(*) FROM children')).toBe(1);
      expectUntouchedAtVersion(1);
    });
  });

  describe('when a migration ends the transaction it runs in', () => {
    it('should throw MigrationFailedError and keep the version', () => {
      migrateDatabase(database.connection, [FIRST]);

      expect(() =>
        migrateDatabase(database.connection, [
          FIRST,
          second('CREATE TABLE extra (id INTEGER) STRICT; COMMIT;'),
        ]),
      ).toThrow(
        new MigrationFailedError(
          '0002-change.sql: it ended the transaction it runs in.',
        ),
      );
      expectUntouchedAtVersion(1);
    });
  });

  describe('when a row refers to a row that is not there', () => {
    it('should stop the start even with no migration to apply', () => {
      migrateDatabase(database.connection, [FIRST]);
      database.connection.exec(`
        PRAGMA foreign_keys = OFF;
        INSERT INTO children (id, parent_id) VALUES (3, 42);
        PRAGMA foreign_keys = ON;
      `);

      expect(() => migrateDatabase(database.connection, [FIRST])).toThrow(
        'The database failed its checks: row 3 of children refers to a ' +
          'missing row of parents.',
      );
    });
  });
});
