import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SchemaRows, STORED_TIME } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const UNIQUE = 'UNIQUE constraint failed';
const CHECK = 'CHECK constraint failed';

let database: TemporaryDatabase;
let rows: SchemaRows;

const leased = (serializationKey: string): Record<string, string> => ({
  status: 'leased',
  serialization_key: serializationKey,
  lease_expires_at: STORED_TIME,
});

beforeEach(() => {
  database = createMigratedDatabase();
  rows = new SchemaRows(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('jobs', () => {
  describe('one running job per repository', () => {
    it('should refuse a second leased job of the same repository', () => {
      rows.job(leased('repository-1'));

      expect(() => rows.job(leased('repository-1'))).toThrow(UNIQUE);
    });

    it('should allow pending and finished jobs beside the leased one', () => {
      rows.job(leased('repository-1'));

      expect(() => {
        for (const status of ['pending', 'completed', 'dead', 'cancelled']) {
          rows.job({ status, serialization_key: 'repository-1' });
        }
      }).not.toThrow();
    });

    it('should allow a leased job of another repository', () => {
      rows.job(leased('repository-1'));

      expect(() => rows.job(leased('repository-2'))).not.toThrow();
    });
  });

  describe('the idempotency key', () => {
    it('should refuse a second job with the same key', () => {
      rows.job({ idempotency_key: 'improvement:1:run', status: 'completed' });

      expect(() => rows.job({ idempotency_key: 'improvement:1:run' })).toThrow(
        UNIQUE,
      );
    });
  });

  describe('the status', () => {
    it.each(['running', 'Pending', 'finished', ''])(
      'should refuse the unknown status "%s"',
      (status) => {
        expect(() => rows.job({ status })).toThrow(CHECK);
      },
    );

    it('should refuse a leased job with no end of its lease', () => {
      expect(() => rows.job({ status: 'leased' })).toThrow(CHECK);
    });
  });

  describe('the stored documents', () => {
    it.each(['payload', 'progress', 'outcome'])(
      'should refuse a %s that is not JSON',
      (column) => {
        expect(() => rows.job({ [column]: 'done' })).toThrow(CHECK);
      },
    );

    it('should accept no progress until a handler reports one', () => {
      const id = rows.job({ progress: null });

      database.connection
        .prepare('UPDATE jobs SET progress = ? WHERE id = ?')
        .run('{"version":1,"steps":[]}', id);
      expect(
        database.connection
          .prepare('SELECT progress FROM jobs WHERE id = ?')
          .get(id),
      ).toEqual({ progress: '{"version":1,"steps":[]}' });
    });
  });
});
