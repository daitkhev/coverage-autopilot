import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * The program of the engine is there, and no engine answers it. An engine
 * that is starting, or one a person starts, answers a later try.
 */
export class SandboxEngineNotRunningError extends InfrastructureError {
  public readonly code = 'sandbox_engine_not_running';
  public readonly retryable = true;
}
