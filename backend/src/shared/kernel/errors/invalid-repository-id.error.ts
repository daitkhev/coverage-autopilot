import { DomainError } from '#kernel/errors/domain.error';

/** A text that is not an id as the id generator makes one. */
export class InvalidRepositoryIdError extends DomainError {
  public readonly code = 'invalid_repository_id';
  public readonly retryable = false;
}
