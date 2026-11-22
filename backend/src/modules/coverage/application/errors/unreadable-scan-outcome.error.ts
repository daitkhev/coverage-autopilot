import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A scan job that completed with an outcome this service cannot read: a
 * newer service wrote it. Reading it again gives the same answer, so it is
 * not retried.
 */
export class UnreadableScanOutcomeError extends ApplicationError {
  public readonly code = 'unreadable_scan_outcome';
  public readonly retryable = false;
}
