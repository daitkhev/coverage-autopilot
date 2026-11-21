import { DomainError } from '#kernel/errors/domain.error';

/**
 * An action that does not fit the status of the improvement, such as an
 * approval of one that does not wait for it. The status decides, so the
 * same action is refused again until the status changes.
 */
export class InvalidTransitionError extends DomainError {
  public readonly code = 'invalid_transition';
  public readonly retryable = false;
}
