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

  describe('the threshold of its own', () => {
    it.each([
      ['no threshold', {}],
      ['the least threshold', { threshold_percentage: 1 }],
      ['the most threshold', { threshold_percentage: 100 }],
    ])('should accept %s', (_name, row) => {
      expect(() => rows.repository(row)).not.toThrow();
    });

    it.each([
      ['a threshold of nothing', { threshold_percentage: 0 }],
      ['a threshold above everything', { threshold_percentage: 101 }],
    ])('should refuse %s', (_name, row) => {
      expect(() => rows.repository(row)).toThrow(CHECK);
    });
  });

  describe('the install mode of its own', () => {
    it.each([
      ['no mode', {}],
      ['a sandboxed install', { install_mode: 'sandboxed' }],
      ['a trusted install', { install_mode: 'trusted' }],
    ])('should accept %s', (_name, row) => {
      expect(() => rows.repository(row)).not.toThrow();
    });

    it('should refuse a mode the service does not know', () => {
      expect(() => rows.repository({ install_mode: 'open' })).toThrow(CHECK);
    });
  });
});
