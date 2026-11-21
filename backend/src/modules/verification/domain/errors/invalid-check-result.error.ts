import { DomainError } from '#kernel/errors/domain.error';

/** A result of a check that cannot be, such as a failure with no words. */
export class InvalidCheckResultError extends DomainError {
  public readonly code = 'invalid_check_result';
  public readonly retryable = false;
}
