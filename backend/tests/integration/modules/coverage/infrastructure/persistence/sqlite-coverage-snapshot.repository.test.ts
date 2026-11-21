import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import {
  fixtureFiles,
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_ID,
  snapshotOf,
} from '#tests/support/coverage-snapshots';
import { SchemaRows } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const OTHER_ID = '00000000-0000-4000-8000-0000000000cc';

const { unused } = fixtureFiles();

const snapshot = fixtureSnapshot();

let database: TemporaryDatabase;
let repository: SqliteCoverageSnapshotRepository;
let transactions: SqliteTransactionRunner;

async function save(saved: CoverageSnapshot): Promise<CoverageSnapshot> {
  return transactions.run(async (transaction) =>
    repository.save(saved, transaction),
  );
}

function rows(sql: string): Record<string, unknown>[] {
  return database.connection.prepare(sql).all();
}

beforeEach(() => {
  database = createMigratedDatabase();
  new SchemaRows(database.connection).repository({ id: REPOSITORY_ID });
  repository = new SqliteCoverageSnapshotRepository(database.connection);
  transactions = new SqliteTransactionRunner(database.connection);
});

afterEach(() => {
  database.remove();
});

describe('SqliteCoverageSnapshotRepository', () => {
  describe('save', () => {
    it('should give back the same snapshot when it is read', async () => {
      await save(snapshot);

      const found = await repository.findById(SnapshotId.create(SNAPSHOT_ID));

      expect(found).toEqual(snapshot);
      expect(found?.totals.equals(snapshot.totals)).toBe(true);
    });

    it('should store a row for every file with counters and none else', async () => {
      await save(snapshot);

      expect(
        rows('SELECT file_path, state FROM file_coverages ORDER BY file_path'),
      ).toEqual([
        { file_path: 'src/types.ts', state: 'no_executable_code' },
        { file_path: 'src/unused.ts', state: 'measured' },
        { file_path: 'src/used.ts', state: 'measured' },
      ]);
    });

    it('should store the totals of the measured files', async () => {
      await save(snapshot);

      expect(
        rows(
          'SELECT lines_covered, lines_total, branches_covered, ' +
            'branches_total FROM coverage_snapshots',
        ),
      ).toEqual([
        {
          lines_covered: 2,
          lines_total: 6,
          branches_covered: 1,
          branches_total: 2,
        },
      ]);
    });

    describe('when a snapshot with the same origin key is stored', () => {
      it('should change nothing and return the stored one', async () => {
        await save(snapshot);
        const late = snapshotOf({ id: OTHER_ID, files: [unused] });

        const returned = await save(late);

        expect(returned.id.value).toBe(SNAPSHOT_ID);
        expect(rows('SELECT id FROM coverage_snapshots')).toEqual([
          { id: SNAPSHOT_ID },
        ]);
        expect(rows('SELECT file_path FROM file_coverages')).toHaveLength(3);
      });
    });
  });

  describe('findByOriginKey', () => {
    it('should find the snapshot an origin asked for', async () => {
      await save(snapshot);

      const found = await repository.findByOriginKey('scan:origin');

      expect(found?.id.value).toBe(SNAPSHOT_ID);
    });

    describe('when no snapshot has the key', () => {
      it('should answer with null', async () => {
        await expect(repository.findByOriginKey('scan:other')).resolves.toBe(
          null,
        );
        await expect(
          repository.findById(SnapshotId.create(OTHER_ID)),
        ).resolves.toBeNull();
      });
    });
  });
});
