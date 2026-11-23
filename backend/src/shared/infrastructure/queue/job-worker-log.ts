import type { ClaimedRow } from '#infrastructure/database/sqlite-job-leases';
import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import type { JobOutcome } from '#ports/job-handler.port';
import type { LogFields, Logger } from '#ports/logger.port';

/** What the worker wrote at the end of a job, as the last line says. */
export type JobEnd =
  | { readonly outcome: 'completed'; readonly result: JobOutcome }
  /** The worker wrote nothing: a cancel, a deadline or a lost lease. */
  | { readonly outcome: 'stopped'; readonly reason: string }
  | { readonly outcome: 'put_back' | 'given_up' };

/**
 * The ids that tie the lines of one journey together: the job, whose id
 * is also the id of a scan, the object it works on, and the repository.
 */
function jobOf(row: ClaimedRow): LogFields {
  return {
    jobId: row.id,
    kind: row.kind,
    subjectId: row.subjectId,
    repositoryId: row.serializationKey,
    attempt: row.runs,
  };
}

/** What the handler returned, or why the job stopped, as a line names it. */
function endFieldsOf(end: JobEnd): LogFields {
  if (end.outcome === 'stopped') {
    return { reason: end.reason };
  }
  const result = end.outcome === 'completed' ? end.result['outcome'] : null;
  return typeof result === 'string' ? { result } : {};
}

/**
 * What the worker says of its jobs: each is taken, may fail, may be put
 * back in the queue or given up, and ends. A worker never rejects, so
 * without these lines a job that fails, or a database that refuses a
 * write, would leave no trace but a row that does not move.
 */
export class JobWorkerLog {
  private readonly logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger.child({ component: 'job-worker' });
  }

  public claimRefused(error: unknown): void {
    this.logger.warn('No job could be claimed.', faultFieldsOf(error));
  }

  public taken(row: ClaimedRow): void {
    this.logger.info('A job was taken.', jobOf(row));
  }

  public failed(row: ClaimedRow, error: unknown): void {
    this.logger.error('The handler of a job failed.', {
      ...jobOf(row),
      ...faultFieldsOf(error),
    });
  }

  /** `reason` is the code of the retry, or why the worker stopped it. */
  public putBack(row: ClaimedRow, reason: string): void {
    this.logger.warn('A job was put back in the queue.', {
      ...jobOf(row),
      reason,
    });
  }

  public givenUp(row: ClaimedRow): void {
    this.logger.error('A job was given up: it will not run again.', jobOf(row));
  }

  public ended(row: ClaimedRow, end: JobEnd, durationMs: number): void {
    this.logger.info('A job ended.', {
      ...jobOf(row),
      outcome: end.outcome,
      ...endFieldsOf(end),
      durationMs,
    });
  }

  /** The row stays leased until its lease runs out. */
  public endNotWritten(row: ClaimedRow, error: unknown): void {
    this.logger.error('The end of a job could not be written.', {
      ...jobOf(row),
      ...faultFieldsOf(error),
    });
  }

  public unreadable(row: ClaimedRow): void {
    this.logger.error(
      'The stored payload of a job cannot be read, so the job is dead.',
      jobOf(row),
    );
  }
}
