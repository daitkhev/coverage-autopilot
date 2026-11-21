import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SchemaRows, STORED_TIME } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const UNIQUE = 'UNIQUE constraint failed';
const CHECK = 'CHECK constraint failed';
const HEAD = 'b'.repeat(40);

let database: TemporaryDatabase;
let rows: SchemaRows;

beforeEach(() => {
  database = createMigratedDatabase();
  rows = new SchemaRows(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('repositories', () => {
  it('should refuse the same owner and name twice', () => {
    rows.repository({ name: 'payments' });

    expect(() => rows.repository({ name: 'payments' })).toThrow(UNIQUE);
  });

  describe('the head of the default branch', () => {
    it('should accept a repository that no check has read yet', () => {
      expect(() => rows.repository()).not.toThrow();
    });

    it('should accept a head with the time it was read', () => {
      expect(() =>
        rows.repository({ head_commit: HEAD, head_checked_at: STORED_TIME }),
      ).not.toThrow();
    });

    it.each([
      ['a head with no time', { head_commit: HEAD }],
      ['a time with no head', { head_checked_at: STORED_TIME }],
    ])('should refuse %s', (_name, row) => {
      expect(() => rows.repository(row)).toThrow(CHECK);
    });
  });
});
