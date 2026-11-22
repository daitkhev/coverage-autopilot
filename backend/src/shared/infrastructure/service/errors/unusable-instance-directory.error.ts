import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The instance directory cannot be made, or kept to its owner, such as a
 * file in its place or a directory of another user. A person has to see to
 * it, so a second start fails the same way.
 */
export class UnusableInstanceDirectoryError extends InfrastructureError {
  public readonly code = 'unusable_instance_directory';
  public readonly retryable = false;
}
