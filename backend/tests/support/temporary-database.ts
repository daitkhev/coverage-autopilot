import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  MIGRATIONS_DIRECTORY,
  readMigrations,
} from '#infrastructure/database/migration-files';
import { openSqliteConnection } from '#infrastructure/database/sqlite-connection';
import { migrateDatabase } from '#infrastructure/database/sqlite-migrator';

/** A database file in a folder of its own, removed by `remove`. */
export interface TemporaryDatabase {
  readonly path: string;
  readonly connection: DatabaseSync;
  /** Closes the connection if it is open and removes the folder. */
  remove(): void;
}

/** An empty database, at version 0, with the settings of the service. */
export function createEmptyDatabase(): TemporaryDatabase {
  const folder = mkdtempSync(join(tmpdir(), 'coverage-autopilot-'));
  const path = join(folder, 'service.sqlite');
  const connection = openSqliteConnection(path);
  return {
    path,
    connection,
    remove: () => {
      if (connection.isOpen) {
        connection.close();
      }
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

/** A database with every migration of the service applied. */
export function createMigratedDatabase(): TemporaryDatabase {
  const database = createEmptyDatabase();
  migrateDatabase(database.connection, readMigrations(MIGRATIONS_DIRECTORY));
  return database;
}
