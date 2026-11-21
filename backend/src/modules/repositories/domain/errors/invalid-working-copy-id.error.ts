import { DomainError } from '#kernel/errors/domain.error';

/** A purpose that cannot name a working copy, or a text that is no id. */
export class InvalidWorkingCopyIdError extends DomainError {
  public readonly code = 'invalid_working_copy_id';
  public readonly retryable = false;
}
