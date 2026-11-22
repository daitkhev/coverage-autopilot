import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * Work that needs the instance lock was given one that was released, so
 * another service may hold it now. A mistake in the code, not in the data.
 */
export class InstanceLockReleasedError extends InfrastructureError {
  public readonly code = 'instance_lock_released';
  public readonly retryable = false;
}
