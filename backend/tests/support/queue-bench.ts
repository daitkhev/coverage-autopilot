import type { DatabaseSync } from 'node:sqlite';

import { Test } from '@nestjs/testing';

import {
  openSqliteConnection,
  SQLITE_CONNECTION,
} from '#infrastructure/database/sqlite-connection';
import { SqliteJobTable } from '#infrastructure/database/sqlite-job-table';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { JobWorker } from '#infrastructure/queue/job-worker';
import { JobWorkerScheduler } from '#infrastructure/queue/job-worker-scheduler';
import {
  DEFAULT_JOB_WORKER_SETTINGS,
  JOB_WORKER_SETTINGS,
  type JobWorkerSettings,
} from '#infrastructure/queue/job-worker-settings';
import { SqliteJobQueue } from '#infrastructure/queue/sqlite-job-queue.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK } from '#kernel/time/clock';
import { JOB_HANDLERS } from '#ports/job-handler.port';
import {
  type EnqueueJobRequest,
  type EnqueueJobResult,
  JOB_QUEUE,
  type JobQueue,
} from '#ports/job-queue.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { FaultyTransactions } from '#tests/support/faulty-transactions';
import { FixedClock } from '#tests/support/fixed-clock';
import { ScriptedJobHandler } from '#tests/support/scripted-job-handler';
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

/** One service as far as the queue goes, on a connection of its own. */
export interface QueueProcess {
  readonly queue: JobQueue;
  readonly worker: JobWorker;
  readonly scheduler: JobWorkerScheduler;
  readonly transactions: FaultyTransactions;
  /** Runs every job of the kind `scan`. */
  readonly handler: ScriptedJobHandler;
  readonly settings: JobWorkerSettings;
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

/**
 * A migrated database, a clock that stands still, and as many processes
 * of the service on that database as a test opens. Each process has its
 * own connection, as two services on one machine would.
 */
export class QueueBench {
  public readonly clock = new FixedClock(START);
  private readonly database: TemporaryDatabase = createMigratedDatabase();
  private readonly ids = new SequentialIdGenerator();
  private readonly connections: DatabaseSync[] = [];
  private processes = 0;

  public get connection(): DatabaseSync {
    return this.database.connection;
  }

  /** The providers as the service names them, built by NestJS. */
  public async open(
    settings: Partial<JobWorkerSettings> = {},
  ): Promise<QueueProcess> {
    const handler = new ScriptedJobHandler('scan');
    const all = { ...DEFAULT_JOB_WORKER_SETTINGS, ...settings };
    const module = await Test.createTestingModule({
      providers: [
        { provide: SQLITE_CONNECTION, useValue: this.nextConnection() },
        SqliteTransactionRunner,
        {
          provide: TRANSACTION_MANAGER,
          useFactory: (runner: SqliteTransactionRunner) =>
            new FaultyTransactions(runner),
          inject: [SqliteTransactionRunner],
        },
        { provide: CLOCK, useValue: this.clock },
        { provide: ID_GENERATOR, useValue: this.ids },
        { provide: JOB_HANDLERS, useValue: [handler] },
        { provide: JOB_WORKER_SETTINGS, useValue: all },
        SqliteJobTable,
        { provide: JOB_QUEUE, useClass: SqliteJobQueue },
        JobWorker,
        JobWorkerScheduler,
      ],
    }).compile();
    const queue = module.get<JobQueue>(JOB_QUEUE);
    const transactions = module.get<FaultyTransactions>(TRANSACTION_MANAGER);
    return {
      queue,
      worker: module.get(JobWorker),
      scheduler: module.get(JobWorkerScheduler),
      transactions,
      handler,
      settings: all,
      enqueue: async (request) =>
        transactions.run(async (transaction) =>
          queue.enqueue(request, transaction),
        ),
    };
  }

  /** A process with the scan `scan-1` of WIDGETS waiting in its queue. */
  public async openWithScan(): Promise<{
    readonly service: QueueProcess;
    readonly jobId: string;
  }> {
    const service = await this.open();
    const { jobId } = await service.enqueue(scanOf(WIDGETS, 'scan-1'));
    return { service, jobId };
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

  /** The moment a lease taken now runs out, as the database stores it. */
  public leaseEnd(settings: JobWorkerSettings): string {
    return this.clock.now().plusMilliseconds(settings.leaseMs).toString();
  }

  public remove(): void {
    for (const connection of this.connections) {
      connection.close();
    }
    this.database.remove();
  }

  /** The first process takes the connection of the bench. */
  private nextConnection(): DatabaseSync {
    this.processes += 1;
    if (this.processes === 1) {
      return this.database.connection;
    }
    const connection = openSqliteConnection(this.database.path);
    this.connections.push(connection);
    return connection;
  }
}
