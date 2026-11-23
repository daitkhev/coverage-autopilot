import { ApplicationError } from '#kernel/errors/application.error';

/**
 * The host makes a new fork in the background, and git did not reach it
 * within the wait. The host may have made it by a later try.
 */
export class ForkNotReadyError extends ApplicationError {
  public readonly code = 'fork_not_ready';
  public readonly retryable = true;
}
