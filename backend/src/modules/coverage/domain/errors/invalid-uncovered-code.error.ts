import { DomainError } from '#kernel/errors/domain.error';

/** A line that is not a line of a file, or a range that ends before it starts. */
export class InvalidUncoveredCodeError extends DomainError {
  public readonly code = 'invalid_uncovered_code';
  public readonly retryable = false;
}
