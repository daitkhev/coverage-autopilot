import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A column of the jobs table holds what the queue never writes. The row
 * was changed outside the service, so running it again would not help.
 */
export class InvalidStoredJobError extends InfrastructureError {
  public readonly code = 'invalid_stored_job';
  public readonly retryable = false;
}
