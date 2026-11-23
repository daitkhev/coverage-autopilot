import { ApplicationError } from '#kernel/errors/application.error';

/**
 * The host did not say whether the account may push, so publishing does
 * not know where a result goes. The host may answer a later try.
 */
export class PermissionNotReadError extends ApplicationError {
  public readonly code = 'permission_not_read';
  public readonly retryable = true;
}
