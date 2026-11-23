import type { DatabaseSync } from 'node:sqlite';

import {
  brokenReferences,
  checkIntegrity,
} from '#infrastructure/database/database-integrity';
import { DatabaseTooNewError } from '#infrastructure/database/errors/database-too-new.error';
import { MigrationFailedError } from '#infrastructure/database/errors/migration-failed.error';
import type { Migration } from '#infrastructure/database/migration-files';

/** The versions of a database before and after a start. */
export interface MigrationReport {
  readonly from: number;
  readonly to: number;
}

/** SQLite keeps it in the file, so no table records which migrations ran. */
function versionOf(connection: DatabaseSync): number {
  const row = connection.prepare('PRAGMA user_version').get();
  return Number(row?.['user_version']);
}

function problemAfter(connection: DatabaseSync): string {
  if (!connection.isTransaction) {
    return 'it ended the transaction it runs in';
  }
  const broken = brokenReferences(connection);
  return broken.length === 0 ? '' : broken.join('; ');
}

/** Steps 2 to 5: the statements and the new version commit together. */
function commitMigration(connection: DatabaseSync, migration: Migration): void {
  connection.exec('BEGIN IMMEDIATE');
  connection.exec(migration.sql);
  const problem = problemAfter(connection);
  if (problem !== '') {
    throw new MigrationFailedError(`${migration.name}: ${problem}.`);
  }
  connection.exec(`PRAGMA user_version = ${String(migration.version)}`);
  connection.exec('COMMIT');
}

function migrateInTransaction(
  connection: DatabaseSync,
  migration: Migration,
): void {
  try {
    commitMigration(connection, migration);
  } catch (error) {
    if (connection.isTransaction) {
      connection.exec('ROLLBACK');
    }
    throw error instanceof MigrationFailedError
      ? error
      : new MigrationFailedError(`${migration.name}: ${String(error)}`, {
          cause: error,
        });
  }
}

/**
 * Steps 1 and 6. SQLite ignores the switch inside a transaction, so it
 * comes first. With the checks on, SQLite refuses to drop a table that
 * others refer to, which building a table again needs.
 */
function applyMigration(connection: DatabaseSync, migration: Migration): void {
  connection.exec('PRAGMA foreign_keys = OFF');
  try {
    migrateInTransaction(connection, migration);
  } finally {
    connection.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Brings the database up to the last migration, then checks the whole
 * file. It runs before any other connection is open: the service takes the
 * instance lock first and opens its socket after.
 */
export function migrateDatabase(
  connection: DatabaseSync,
  migrations: readonly Migration[],
): MigrationReport {
  const from = versionOf(connection);
  const to = migrations.at(-1)?.version ?? 0;
  if (from > to) {
    throw new DatabaseTooNewError(
      `The database is at version ${String(from)}, and this service knows ` +
        `versions up to ${String(to)}. Start the newer service.`,
    );
  }
  for (const migration of migrations.filter((m) => m.version > from)) {
    applyMigration(connection, migration);
  }
  checkIntegrity(connection);
  return { from, to };
}
