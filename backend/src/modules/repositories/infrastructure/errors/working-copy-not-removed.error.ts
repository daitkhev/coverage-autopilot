import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A folder of a working copy stayed even once the service gave itself
 * back the permissions inside the copy, as when the folder that holds the
 * copies is locked or the disk fails. A second try a moment later meets
 * the same folder.
 */
export class WorkingCopyNotRemovedError extends InfrastructureError {
  public readonly code = 'working_copy_not_removed';
  public readonly retryable = false;
}
