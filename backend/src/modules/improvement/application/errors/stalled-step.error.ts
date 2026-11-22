import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A step said to go on and left the improvement as it found it, so the
 * handler would run it again for ever. It is a fault of the code: a run
 * again finds the same, so it is not retried.
 */
export class StalledStepError extends ApplicationError {
  public readonly code = 'stalled_step';
  public readonly retryable = false;
}
