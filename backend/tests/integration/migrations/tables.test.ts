import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MIGRATIONS_DIRECTORY,
  readMigrations,
} from '#infrastructure/database/migration-files';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

let database: TemporaryDatabase;

function tablesWhere(condition: string): unknown[] {
  return database.connection
    .prepare(
      "SELECT name FROM pragma_table_list WHERE schema = 'main' " +
        `AND type = 'table' AND name NOT LIKE 'sqlite_%' AND ${condition} ` +
        'ORDER BY name',
    )
    .all()
    .map((row) => row['name']);
}

beforeEach(() => {
  database = createMigratedDatabase();
});

afterEach(() => {
  database.remove();
});

describe('the migrations of the service', () => {
  it('should be numbered from 1 with no gaps, as the service reads them', () => {
    const migrations = readMigrations(MIGRATIONS_DIRECTORY);

    expect(migrations[0]?.name).toBe('0001-create-the-schema.sql');
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations.map((_, index) => index + 1),
    );
  });

  it('should bring a database to the version of the last one', () => {
    const last = readMigrations(MIGRATIONS_DIRECTORY).length;
    const version = database.connection.prepare('PRAGMA user_version').get();

    expect(version).toEqual({ user_version: last });
  });
});

describe('the schema', () => {
  it('should hold three aggregates in five tables and the queue in one', () => {
    expect(tablesWhere('1 = 1')).toEqual([
      'attempts',
      'coverage_snapshots',
      'file_coverages',
      'improvements',
      'jobs',
      'repositories',
    ]);
  });

  it('should make every table STRICT', () => {
    expect(tablesWhere('strict = 0')).toEqual([]);
  });

  it('should give the queue no foreign key to another table', () => {
    const keys = database.connection
      .prepare("SELECT * FROM pragma_foreign_key_list('jobs')")
      .all();

    expect(keys).toEqual([]);
  });
});
