import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The tree of a working copy holds a `.git` of its own, which only code
 * that was lent the copy can have put there. git is not run in it, since
 * such a `.git` could make git start a program of that code's choice.
 */
export class WorkingCopyTamperedError extends InfrastructureError {
  public readonly code = 'working_copy_tampered';
  public readonly retryable = false;
}
