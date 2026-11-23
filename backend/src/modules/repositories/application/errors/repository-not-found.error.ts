import { ApplicationError } from '#kernel/errors/application.error';

/** An operation named a repository that is not connected. */
export class RepositoryNotFoundError extends ApplicationError {
  public readonly code = 'repository_not_found';
  public readonly retryable = false;
}
