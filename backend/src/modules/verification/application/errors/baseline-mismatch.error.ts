import { ApplicationError } from '#kernel/errors/application.error';

/**
 * A patch was given a baseline of another commit or another target file.
 * The caller keeps the baseline, so this is a mistake of the caller, and
 * running again does not help.
 */
export class BaselineMismatchError extends ApplicationError {
  public readonly code = 'baseline_mismatch';
  public readonly retryable = false;
}
