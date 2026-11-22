import { ApplicationError } from '#kernel/errors/application.error';

/**
 * An improvement at work that has no deadline. Work starts with one, so
 * the improvement was not saved by its transitions, and a run again
 * finds the same.
 */
export class MissingDeadlineError extends ApplicationError {
  public readonly code = 'missing_deadline';
  public readonly retryable = false;
}
