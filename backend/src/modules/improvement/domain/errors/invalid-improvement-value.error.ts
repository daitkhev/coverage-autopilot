import { DomainError } from '#kernel/errors/domain.error';

/**
 * A value an improvement was given that breaks a rule of its own, such as
 * a budget of no attempts or a blank sentence. The same value is refused
 * again, so it is not retried.
 */
export class InvalidImprovementValueError extends DomainError {
  public readonly code = 'invalid_improvement_value';
  public readonly retryable = false;
}
