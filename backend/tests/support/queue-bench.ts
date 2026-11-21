import type { DatabaseSync } from 'node:sqlite';

import { Test } from '@nestjs/testing';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteJobTable } from '#infrastructure/database/sqlite-job-table';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { SqliteJobQueue } from '#infrastructure/queue/sqlite-job-queue.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK } from '#kernel/time/clock';
import {
  type EnqueueJobRequest,
  type EnqueueJobResult,
  JOB_QUEUE,
  type JobQueue,
} from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

/** Two repositories of the tests. */
export const WIDGETS = RepositoryId.create(
  '00000000-0000-4000-8000-00000000a001',
);
export const GADGETS = RepositoryId.create(
  '00000000-0000-4000-8000-00000000a002',
);

/** When every bench starts. */
export const START = '2026-11-21T10:00:00.000Z';

/** One service as far as the queue goes. */
export interface QueueProcess {
  readonly queue: JobQueue;
  readonly transactions: TransactionManager;
  /** Enqueues in a transaction of its own. */
  readonly enqueue: (request: EnqueueJobRequest) => Promise<EnqueueJobResult>;
}

/** A scan of a repository, keyed by its subject. */
export function scanOf(
  repositoryId: RepositoryId,
  subjectId: string,
): EnqueueJobRequest {
  return {
    kind: 'scan',
    repositoryId,
    idempotencyKey: `scan:${subjectId}:run`,
    subjectId,
    payload: { version: 1, branch: 'main' },
  };
}

/** A migrated database, a clock that stands still, and the service on it. */
export class QueueBench {
  public readonly clock = new FixedClock(START);
  private readonly database: TemporaryDatabase = createMigratedDatabase();
  private readonly ids = new SequentialIdGenerator();

  public get connection(): DatabaseSync {
    return this.database.connection;
  }

  /** The providers as the service names them, built by NestJS. */
  public async open(): Promise<QueueProcess> {
    const module = await Test.createTestingModule({
      providers: [
        { provide: SQLITE_CONNECTION, useValue: this.connection },
        { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
        { provide: CLOCK, useValue: this.clock },
        { provide: ID_GENERATOR, useValue: this.ids },
        SqliteJobTable,
        { provide: JOB_QUEUE, useClass: SqliteJobQueue },
      ],
    }).compile();
    const queue = module.get<JobQueue>(JOB_QUEUE);
    const transactions = module.get<TransactionManager>(TRANSACTION_MANAGER);
    return {
      queue,
      transactions,
      enqueue: async (request) =>
        transactions.run(async (transaction) =>
          queue.enqueue(request, transaction),
        ),
    };
  }

  /** The columns of a job row that the tests look at. */
  public stored(jobId: string): Record<string, unknown> {
    return {
      ...this.connection
        .prepare(
          `SELECT status, runs, lease_token, lease_expires_at, progress,
             progress_updated_at, outcome
           FROM jobs WHERE id = ?`,
        )
        .get(jobId),
    };
  }

  public remove(): void {
    this.database.remove();
  }
}
