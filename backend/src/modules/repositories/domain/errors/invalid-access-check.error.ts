import { DomainError } from '#kernel/errors/domain.error';

/**
 * A step recorded out of its order: after a failure, after the last step,
 * or a head that came with any step but the last one that passed.
 */
export class InvalidAccessCheckError extends DomainError {
  public readonly code = 'invalid_access_check';
  public readonly retryable = false;
}
