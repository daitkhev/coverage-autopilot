import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * No program answered to the name of a tool: it is not installed, or not
 * on the `PATH` it was given.
 */
export class ToolMissingError extends InfrastructureError {
  public readonly code = 'tool_missing';
  public readonly retryable = false;
}
