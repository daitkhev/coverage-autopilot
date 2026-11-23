import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * `gh` has no login for the host of the code. Trying again helps only
 * after the user logs in.
 */
export class GhNotAuthenticatedError extends InfrastructureError {
  public readonly code = 'gh_not_authenticated';
  public readonly retryable = false;
}
