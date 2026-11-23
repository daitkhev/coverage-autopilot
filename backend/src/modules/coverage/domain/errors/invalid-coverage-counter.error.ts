import { DomainError } from '#kernel/errors/domain.error';

/** Counts that are not whole, are negative, or cover more than there is. */
export class InvalidCoverageCounterError extends DomainError {
  public readonly code = 'invalid_coverage_counter';
  public readonly retryable = false;
}
