import { ApplicationError } from '#kernel/errors/application.error';

/**
 * No step does the work of the status an improvement is in: the module
 * was bound with too few steps. A run again finds the same.
 */
export class MissingStepError extends ApplicationError {
  public readonly code = 'missing_step';
  public readonly retryable = false;
}
