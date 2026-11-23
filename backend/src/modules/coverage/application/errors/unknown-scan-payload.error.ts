import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A scan job whose payload has a version this service does not read: a
 * newer service put it in the queue. Running it again gives the same
 * answer, so it is not retried.
 */
export class UnknownScanPayloadError extends ApplicationError {
  public readonly code = 'unknown_scan_payload';
  public readonly retryable = false;
}
