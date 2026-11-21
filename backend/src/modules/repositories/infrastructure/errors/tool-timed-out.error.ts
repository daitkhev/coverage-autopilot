import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** A tool ran longer than its time limit and was stopped. */
export class ToolTimedOutError extends InfrastructureError {
  public readonly code = 'tool_timed_out';
  public readonly retryable = true;
}
