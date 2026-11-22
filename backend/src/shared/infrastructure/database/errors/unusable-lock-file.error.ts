import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The file of the instance lock cannot be opened, or holds something that
 * is not SQLite. No service of the instance can start until a person sees
 * to it, so a second start fails the same way.
 */
export class UnusableLockFileError extends InfrastructureError {
  public readonly code = 'unusable_lock_file';
  public readonly retryable = false;
}
