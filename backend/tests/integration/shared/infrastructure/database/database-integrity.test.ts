import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkIntegrity } from '#infrastructure/database/database-integrity';
import { DatabaseIntegrityError } from '#infrastructure/database/errors/database-integrity.error';
import { openSqliteConnection } from '#infrastructure/database/sqlite-connection';
import {
  createEmptyDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

let database: TemporaryDatabase;

beforeEach(() => {
  database = createEmptyDatabase();
  database.connection.exec(`
    CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT) STRICT;
    INSERT INTO notes (text) VALUES ('kept');
  `);
});

afterEach(() => {
  database.remove();
});

describe('checkIntegrity', () => {
  it('should pass a sound database', () => {
    expect(() => {
      checkIntegrity(database.connection);
    }).not.toThrow();
  });

  describe('when the file breaks a rule of its own schema', () => {
    it('should throw DatabaseIntegrityError with what SQLite found', () => {
      database.connection.exec(`
        INSERT INTO notes (text) VALUES (NULL);
        PRAGMA writable_schema = ON;
        UPDATE sqlite_schema
          SET sql = 'CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL) STRICT'
          WHERE name = 'notes';
      `);
      database.connection.close();
      const damaged = openSqliteConnection(database.path);

      expect(() => {
        checkIntegrity(damaged);
      }).toThrow(
        new DatabaseIntegrityError(
          'The database failed its checks: NULL value in notes.text.',
        ),
      );
      damaged.close();
    });
  });
});
