import type { ClaimedRow } from '#infrastructure/database/sqlite-job-leases';
import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import type { LogFields, Logger } from '#ports/logger.port';

function jobOf(row: ClaimedRow): LogFields {
  return {
    jobId: row.id,
    kind: row.kind,
    subjectId: row.subjectId,
    run: row.runs,
  };
}

/**
 * What the worker says of its jobs. A worker never rejects, so without
 * these lines a job that fails, or a database that refuses a write, would
 * leave no trace but a row that does not move.
 */
export class JobWorkerLog {
  private readonly logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger.child({ component: 'job-worker' });
  }

  public claimRefused(error: unknown): void {
    this.logger.warn('No job could be claimed.', faultFieldsOf(error));
  }

  public started(row: ClaimedRow): void {
    this.logger.info('A job started.', jobOf(row));
  }

  /** `step` is what the worker wrote: complete, retry, bury, release, none. */
  public ended(row: ClaimedRow, step: string): void {
    this.logger.info('A job ended.', { ...jobOf(row), step });
  }

  public failed(row: ClaimedRow, error: unknown): void {
    this.logger.error('The handler of a job failed.', {
      ...jobOf(row),
      ...faultFieldsOf(error),
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
