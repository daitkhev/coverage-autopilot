import type { DatabaseSync } from 'node:sqlite';

import type { Provider } from '@nestjs/common';

import { FILE_IMPROVEMENTS } from '#coverage/application/contracts/file-improvements';
import { COVERAGE_SETTINGS } from '#coverage/application/coverage-settings';
import { CoverageModule } from '#coverage/coverage.module';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { SqliteCoverageSnapshotRepository } from '#coverage/infrastructure/persistence/sqlite-coverage-snapshot.repository';
import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteJobTable } from '#infrastructure/database/sqlite-job-table';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { SqliteJobQueue } from '#infrastructure/queue/sqlite-job-queue.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CLOCK } from '#kernel/time/clock';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { JOB_QUEUE } from '#ports/job-queue.port';
import { SANDBOX } from '#ports/sandbox.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { REPOSITORIES_PUBLIC_API } from '#repositories/application/contracts/repositories-public-api';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';
import { inMemoryArtifacts } from '#tests/support/coverage-stand-ins';
import { FixedClock } from '#tests/support/fixed-clock';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  COVERAGE_TEST_SETTINGS,
  RecordingSandbox,
} from '#tests/support/recording-sandbox';
import { QUEUED_AT } from '#tests/support/scan-jobs';
import { type Row, SchemaRows } from '#tests/support/schema-rows';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import { standInFileImprovements } from '#tests/support/stand-in-file-improvements';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';
import { createMigratedDatabase } from '#tests/support/temporary-database';

/** The routes of the coverage module over a database of their own. */
export interface CoverageRoutes {
  readonly service: HttpService;
  /** `acme/widgets`, with no head read. */
  readonly repositories: StandInRepositories;
  /** At `QUEUED_AT` until a test moves it. */
  readonly clock: FixedClock;
  /** Stores a snapshot as a scan would. */
  store(snapshot: CoverageSnapshot): Promise<void>;
  /** The scan of `acme/widgets` that has not ended, as the queue holds it. */
  openScanId(): Promise<string | null>;
  /**
   * Writes a scan job of `acme/widgets` and gives its id, taken from the
   * ids the queue takes its own from.
   */
  scanJob(row?: Row): string;
  close(): Promise<void>;
}

/** What the routes stand on, apart from the module itself. */
interface Below {
  readonly connection: DatabaseSync;
  readonly clock: FixedClock;
  readonly ids: SequentialIdGenerator;
  readonly repositories: StandInRepositories;
}

/** What the service gives the module. */
function providersOf(below: Below): Provider[] {
  return [
    { provide: SQLITE_CONNECTION, useValue: below.connection },
    { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
    { provide: CLOCK, useValue: below.clock },
    { provide: ID_GENERATOR, useValue: below.ids },
    SqliteJobTable,
    { provide: JOB_QUEUE, useClass: SqliteJobQueue },
    { provide: SANDBOX, useValue: new RecordingSandbox() },
    { provide: ARTIFACT_STORE, useValue: inMemoryArtifacts() },
    { provide: REPOSITORIES_PUBLIC_API, useValue: below.repositories },
    { provide: FILE_IMPROVEMENTS, useValue: standInFileImprovements() },
    { provide: COVERAGE_SETTINGS, useValue: COVERAGE_TEST_SETTINGS },
  ];
}

/**
 * The coverage module behind the error filter of the service, as one
 * process would run it: its own handlers, the SQLite queue and store, and
 * the repositories and the improvement modules as stand-ins in memory.
 */
export async function startCoverageRoutes(): Promise<CoverageRoutes> {
  const database = createMigratedDatabase();
  const rows = new SchemaRows(database.connection);
  rows.repository({ id: REPOSITORY_ID });
  const below: Below = {
    connection: database.connection,
    clock: new FixedClock(QUEUED_AT),
    ids: new SequentialIdGenerator(),
    repositories: standInRepositories(),
  };
  const service = await startHttpService({
    imports: [{ module: CoverageModule, providers: providersOf(below) }],
  });
  const snapshots = new SqliteCoverageSnapshotRepository(database.connection);
  const transactions = new SqliteTransactionRunner(database.connection);
  const queue = new SqliteJobQueue(
    new SqliteJobTable(database.connection),
    below.clock,
    below.ids,
  );
  return {
    service,
    repositories: below.repositories,
    clock: below.clock,
    store: async (snapshot) => {
      await transactions.run(async (transaction) =>
        snapshots.save(snapshot, transaction),
      );
    },
    openScanId: async () => {
      const scan = await queue.getOpenJob(REPOSITORY_ID, 'scan');
      return scan?.id ?? null;
    },
    scanJob: (row = {}) => {
      const id = below.ids.generate();
      rows.job({
        id,
        serialization_key: REPOSITORY_ID,
        subject_id: REPOSITORY_ID,
        ...row,
      });
      return id;
    },
    close: async () => {
      await service.close();
      database.remove();
    },
  };
}
