import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The engine did not list the containers of the instance, as when it is
 * not running or stuck. An engine that answers again lists them.
 */
export class SandboxListFailedError extends InfrastructureError {
  public readonly code = 'sandbox_list_failed';
  public readonly retryable = true;
}
