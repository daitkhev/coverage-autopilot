import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The program that starts the container engine could not be started, as
 * when it is not installed. A person has to install it, so a second try
 * fails the same way.
 */
export class SandboxEngineMissingError extends InfrastructureError {
  public readonly code = 'sandbox_engine_missing';
  public readonly retryable = false;
}
