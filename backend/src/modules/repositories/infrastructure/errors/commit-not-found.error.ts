import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The host of the code does not give the commit, for example after the
 * branch that held it was rewritten.
 */
export class CommitNotFoundError extends InfrastructureError {
  public readonly code = 'commit_not_found';
  public readonly retryable = false;
}
