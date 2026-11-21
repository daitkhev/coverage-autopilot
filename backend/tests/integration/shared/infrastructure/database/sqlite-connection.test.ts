import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnsupportedJournalModeError } from '#infrastructure/database/errors/unsupported-journal-mode.error';
import { openSqliteConnection } from '#infrastructure/database/sqlite-connection';
import {
  createEmptyDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

let database: TemporaryDatabase;

function pragma(name: string): unknown {
  const row = database.connection.prepare(`PRAGMA ${name}`).get() ?? {};
  return Object.values(row)[0];
}

beforeEach(() => {
  database = createEmptyDatabase();
});

afterEach(() => {
  database.remove();
});

describe('openSqliteConnection', () => {
  it('should keep a write-ahead log', () => {
    expect(pragma('journal_mode')).toBe('wal');
  });

  it('should check foreign keys', () => {
    expect(pragma('foreign_keys')).toBe(1);
  });

  it('should wait five seconds for a busy database', () => {
    expect(pragma('busy_timeout')).toBe(5_000);
  });

  it('should keep the settings for the next connection to the file', () => {
    database.connection.close();
    const again = openSqliteConnection(database.path);

    expect(again.prepare('PRAGMA journal_mode').get()).toEqual({
      journal_mode: 'wal',
    });
    again.close();
  });

  describe('when the database can keep no write-ahead log', () => {
    it('should throw UnsupportedJournalModeError', () => {
      expect(() => openSqliteConnection(':memory:')).toThrow(
        new UnsupportedJournalModeError(
          'SQLite keeps no write-ahead log for :memory:.',
        ),
      );
    });
  });
});
