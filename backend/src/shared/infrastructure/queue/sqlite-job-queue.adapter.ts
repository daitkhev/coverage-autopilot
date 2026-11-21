import { isDeepStrictEqual } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';

import {
  type JobRow,
  SqliteJobTable,
} from '#infrastructure/database/sqlite-job-table';
import {
  jobDocumentOf,
  jobKindOf,
  jobProgressOf,
  jobStatusOf,
} from '#infrastructure/queue/stored-job-documents';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import type {
  EnqueueJobRequest,
  EnqueueJobResult,
  JobDto,
  JobId,
  JobProgressDto,
  JobQueue,
  JobWait,
} from '#ports/job-queue.port';

/**
 * Both sides go through JSON, so a payload compares as it is stored: the
 * order of the fields does not matter, and `-0` is `0`.
 */
function isSameJob(
  held: JobRow,
  request: EnqueueJobRequest,
  payload: string,
): boolean {
  return (
    held.kind === request.kind &&
    held.serializationKey === request.repositoryId.value &&
    isDeepStrictEqual(jobDocumentOf(held.payload), jobDocumentOf(payload))
  );
}

function jobDtoOf(row: JobRow): JobDto {
  return {
    id: row.id,
    kind: jobKindOf(row.kind),
    repositoryId: RepositoryId.create(row.serializationKey),
    subjectId: row.subjectId,
    status: jobStatusOf(row.status),
    runs: row.runs,
    outcome: row.outcome === null ? null : jobDocumentOf(row.outcome),
  };
}

/** The job queue over the jobs table of the one SQLite database. */
@Injectable()
export class SqliteJobQueue implements JobQueue {
  private readonly table: SqliteJobTable;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  public constructor(
    @Inject(SqliteJobTable) table: SqliteJobTable,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.table = table;
    this.clock = clock;
    this.ids = ids;
  }

  /**
   * The look and the insert share the caller's write transaction, so no
   * other writer takes the key between them.
   */
  public async enqueue(
    request: EnqueueJobRequest,
    transaction: Transaction,
  ): Promise<EnqueueJobResult> {
    const payload = JSON.stringify(request.payload);
    const held = this.table.findByKey(transaction, request.idempotencyKey);
    if (held !== undefined) {
      const same = isSameJob(held, request, payload);
      return Promise.resolve({
        outcome: same ? 'existing' : 'conflict',
        jobId: held.id,
      });
    }
    const jobId = this.ids.generate();
    this.table.insert(transaction, {
      id: jobId,
      kind: request.kind,
      serializationKey: request.repositoryId.value,
      idempotencyKey: request.idempotencyKey,
      subjectId: request.subjectId,
      payload,
      createdAt: this.clock.now().toString(),
      notBefore: request.notBefore?.toString() ?? null,
    });
    return Promise.resolve({ outcome: 'enqueued', jobId });
  }

  /**
   * A worker that runs the job learns it at its next heartbeat or save,
   * and stops with `user_cancelled`.
   */
  public async cancel(jobId: JobId, transaction: Transaction): Promise<void> {
    this.table.cancel(transaction, {
      id: jobId,
      now: this.clock.now().toString(),
    });
    return Promise.resolve();
  }

  public async cancelSubject(
    subjectId: string,
    transaction: Transaction,
  ): Promise<void> {
    this.table.cancelSubject(transaction, {
      subjectId,
      now: this.clock.now().toString(),
    });
    return Promise.resolve();
  }

  public async getJob(jobId: JobId): Promise<JobDto | null> {
    const row = this.table.find(jobId);
    return Promise.resolve(row === undefined ? null : jobDtoOf(row));
  }

  public async getProgress(subjectId: string): Promise<JobProgressDto | null> {
    const row = this.table.progressOf(subjectId);
    if (row === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      jobId: row.jobId,
      updatedAt: Instant.parse(row.updatedAt),
      steps: jobProgressOf(row.progress).steps,
    });
  }

  public async getWait(subjectId: string): Promise<JobWait | null> {
    const pending = this.table.pendingOf(subjectId);
    if (pending === undefined) {
      return Promise.resolve(null);
    }
    const { notBefore, repositoryBusy } = pending;
    if (
      notBefore !== null &&
      this.clock.now().isBefore(Instant.parse(notBefore))
    ) {
      return Promise.resolve('moment');
    }
    return Promise.resolve(repositoryBusy ? 'repository' : 'worker');
  }
}
