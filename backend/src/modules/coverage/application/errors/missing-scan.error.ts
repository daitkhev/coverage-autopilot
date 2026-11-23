import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A scan the service queued, or found by its key, cannot be read back.
 * Nothing removes a job, so this is a fault of the code, not of the
 * moment, and it is not retried.
 */
export class MissingScanError extends ApplicationError {
  public readonly code = 'missing_scan';
  public readonly retryable = false;
}
