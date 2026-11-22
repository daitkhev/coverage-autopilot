import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A snapshot names a repository the module of repositories does not
 * know. Nothing removes a repository, so this is a fault of the code, not
 * of the moment, and it is not retried.
 */
export class MissingRepositoryError extends ApplicationError {
  public readonly code = 'missing_repository';
  public readonly retryable = false;
}
