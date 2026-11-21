import { DomainError } from '#kernel/errors/domain.error';

/** A text that is not the HTTPS address of a repository on the code host. */
export class InvalidRepositoryUrlError extends DomainError {
  public readonly code = 'invalid_repository_url';
  public readonly retryable = false;
}
