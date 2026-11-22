import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The command ended, and the engine did not remove its container, which
 * may still run and still write into the working copy it was lent. The
 * copy cannot be trusted any more, so nothing is read from it and it is
 * thrown away. An engine that answers again runs a later try.
 */
export class SandboxContainerLeftError extends InfrastructureError {
  public readonly code = 'sandbox_container_left';
  public readonly retryable = true;
}
