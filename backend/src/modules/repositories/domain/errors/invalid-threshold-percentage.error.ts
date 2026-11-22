import { DomainError } from '#kernel/errors/domain.error';

/** A number that cannot be the threshold of a repository. */
export class InvalidThresholdPercentageError extends DomainError {
  public readonly code = 'invalid_threshold_percentage';
  public readonly retryable = false;
}
