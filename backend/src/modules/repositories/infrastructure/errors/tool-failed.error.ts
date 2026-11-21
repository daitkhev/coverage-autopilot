import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A tool ended with a failure the module has no answer for, such as a host
 * it could not reach. The message carries the answer of the tool.
 */
export class ToolFailedError extends InfrastructureError {
  public readonly code = 'tool_failed';
  public readonly retryable = true;
}
