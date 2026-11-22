import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementRepository } from '#improvement/domain/repositories/improvement.repository';
import { SqliteImprovementRepository } from '#improvement/infrastructure/persistence/sqlite-improvement.repository';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import type { TransactionManager } from '#ports/transaction-manager.port';
import type { JourneySpec } from '#tests/support/improvement-journeys';
import {
  BASELINE_SNAPSHOT_ID,
  hashOf,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import { InMemoryImprovementRepository } from '#tests/support/in-memory-improvement-repository';
import { InlineTransactions } from '#tests/support/inline-transactions';
import { SchemaRows } from '#tests/support/schema-rows';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

/** A second file of the source snapshot. */
export const OTHER_FILE = 'src/tax.ts';

/** The digits of the last group of a UUID. */
const ID_DIGITS = 12;

/** A second repository, with a snapshot that measured the target file. */
export const OTHER_REPOSITORY_ID = '00000000-0000-4000-8000-000000000201';
export const OTHER_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000202';

/** A store of improvements with the transactions it writes in. */
export interface ImprovementStore {
  readonly repository: ImprovementRepository;
  readonly transactions: TransactionManager;
  /** Writes in one transaction, as the application does. */
  insert(improvement: Improvement): Promise<void>;
  save(improvement: Improvement): Promise<Improvement>;
  remove(): void;
}

function storeOf(
  repository: ImprovementRepository,
  transactions: TransactionManager,
  remove: () => void,
): ImprovementStore {
  return {
    repository,
    transactions,
    insert: async (improvement) =>
      transactions.run(async (transaction) =>
        repository.insert(improvement, transaction),
      ),
    save: async (improvement) =>
      transactions.run(async (transaction) =>
        repository.save(improvement, transaction),
      ),
    remove,
  };
}

/**
 * The rows an improvement of the values refers to: its repository, its
 * source and baseline snapshots, and the files of the source snapshot.
 */
export function seedImprovementRows(rows: SchemaRows): void {
  rows.repository({ id: REPOSITORY_ID });
  rows.snapshot(REPOSITORY_ID, { id: SOURCE_SNAPSHOT_ID });
  rows.snapshot(REPOSITORY_ID, { id: BASELINE_SNAPSHOT_ID });
  rows.file(SOURCE_SNAPSHOT_ID, TARGET_FILE);
  rows.file(SOURCE_SNAPSHOT_ID, OTHER_FILE);
  rows.repository({ id: OTHER_REPOSITORY_ID });
  rows.snapshot(OTHER_REPOSITORY_ID, { id: OTHER_SNAPSHOT_ID });
  rows.file(OTHER_SNAPSHOT_ID, TARGET_FILE);
}

/** The store of the service over a migrated database of its own. */
export function sqliteStore(): ImprovementStore & {
  readonly database: TemporaryDatabase;
} {
  const database = createMigratedDatabase();
  seedImprovementRows(new SchemaRows(database.connection));
  const store = storeOf(
    new SqliteImprovementRepository(database.connection),
    new SqliteTransactionRunner(database.connection),
    () => {
      database.remove();
    },
  );
  return { ...store, database };
}

function memoryStore(): ImprovementStore {
  return storeOf(
    new InMemoryImprovementRepository(),
    new InlineTransactions(),
    () => undefined,
  );
}

/** Each store, so one test shows that the one in memory acts as SQLite. */
export const IMPROVEMENT_STORES = [
  ['SqliteImprovementRepository', sqliteStore],
  ['InMemoryImprovementRepository', memoryStore],
] as const;

/**
 * An improvement other than the one of the values, with an id, a key and
 * a fingerprint of its own, made of one digit from 2 to 9.
 */
export function anotherOf(
  digit: number,
): Required<Pick<JourneySpec, 'id' | 'key' | 'fingerprint'>> {
  const text = String(digit);
  return {
    id: `00000000-0000-4000-8000-${text.repeat(ID_DIGITS)}`,
    key: `request-${text}`,
    fingerprint: hashOf(text),
  };
}
