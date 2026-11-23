import { DomainError } from '#kernel/errors/domain.error';

/** A number or a text that is not a moment the service can keep. */
export class InvalidInstantError extends DomainError {
  public readonly code = 'invalid_instant';
  public readonly retryable = false;
}
