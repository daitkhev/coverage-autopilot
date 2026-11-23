import { ApplicationError } from '#kernel/errors/application.error';

/**
 * git could not read the head of the default branch from the host of the
 * code, or the branch is not there. The host may answer a later try.
 */
export class HeadNotReadError extends ApplicationError {
  public readonly code = 'head_not_read';
  public readonly retryable = true;
}
