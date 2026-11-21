import type { ClaimedRow } from '#infrastructure/database/sqlite-job-leases';
import { ApplicationError } from '#kernel/errors/application.error';
import { DomainError } from '#kernel/errors/domain.error';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import type { LogFields, Logger } from '#ports/logger.port';

/** A message of an error can hold the output of a tool, which is long. */
const MESSAGE_CHARACTERS = 2_000;

/** The code of an error nobody foresaw. */
const UNEXPECTED = 'unexpected';

function isTyped(
  error: unknown,
): error is DomainError | ApplicationError | InfrastructureError {
  return (
    error instanceof DomainError ||
    error instanceof ApplicationError ||
    error instanceof InfrastructureError
  );
}

/** An error as fields of a line: its code and the start of its message. */
function fieldsOf(error: unknown): LogFields {
  const message = error instanceof Error ? error.message : String(error);
  return {
    errorCode: isTyped(error) ? error.code : UNEXPECTED,
    errorMessage: message.slice(0, MESSAGE_CHARACTERS),
  };
}

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
    this.logger.warn('No job could be claimed.', fieldsOf(error));
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
      ...fieldsOf(error),
    });
  }

  /** The row stays leased until its lease runs out. */
  public endNotWritten(row: ClaimedRow, error: unknown): void {
    this.logger.error('The end of a job could not be written.', {
      ...jobOf(row),
      ...fieldsOf(error),
    });
  }

  public unreadable(row: ClaimedRow): void {
    this.logger.error(
      'The stored payload of a job cannot be read, so the job is dead.',
      jobOf(row),
    );
  }
}
