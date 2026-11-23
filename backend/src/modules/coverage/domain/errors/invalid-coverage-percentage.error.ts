import { DomainError } from '#kernel/errors/domain.error';

/** A number that is not a share between 0 and 100. */
export class InvalidCoveragePercentageError extends DomainError {
  public readonly code = 'invalid_coverage_percentage';
  public readonly retryable = false;
}
