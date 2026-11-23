import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A request the sandbox cannot pass to the engine as it is meant, such as
 * a variable whose value holds a line break. It is a mistake of the
 * caller, so nothing is started.
 */
export class InvalidSandboxRequestError extends InfrastructureError {
  public readonly code = 'invalid_sandbox_request';
  public readonly retryable = false;
}
