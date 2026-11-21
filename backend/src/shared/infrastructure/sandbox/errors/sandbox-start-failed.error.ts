import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The engine answered and refused to start the container, as for an image
 * it does not have or a setting it does not take. The settings have to
 * change, so a second try fails the same way.
 */
export class SandboxStartFailedError extends InfrastructureError {
  public readonly code = 'sandbox_start_failed';
  public readonly retryable = false;
}
