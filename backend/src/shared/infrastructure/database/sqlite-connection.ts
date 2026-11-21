import { DatabaseSync } from 'node:sqlite';

import { UnsupportedJournalModeError } from '#infrastructure/database/errors/unsupported-journal-mode.error';

/** The injection token of the one SQLite connection of a process. */
export const SQLITE_CONNECTION = Symbol('SqliteConnection');

/**
 * How long a writer waits for another process to finish before it fails.
 * A transaction holds database statements only, so a wait this long means
 * that something is stuck.
 */
const BUSY_TIMEOUT_MS = 5_000;

const WRITE_AHEAD_LOG = 'wal';

/**
 * Opens the database file with the settings every connection needs:
 * foreign keys on, a write-ahead log, and a wait for a busy database.
 */
export function openSqliteConnection(path: string): DatabaseSync {
  const connection = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: BUSY_TIMEOUT_MS,
  });
  const mode = connection.prepare('PRAGMA journal_mode = WAL').get();
  if (mode?.['journal_mode'] !== WRITE_AHEAD_LOG) {
    connection.close();
    throw new UnsupportedJournalModeError(
      `SQLite keeps no write-ahead log for ${path}.`,
    );
  }
  return connection;
}
