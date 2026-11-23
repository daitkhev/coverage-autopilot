import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A tool wrote more than the limit of its settings and was stopped, so no
 * answer of it is used in part. The same call would write as much again.
 */
export class ToolOutputTooLargeError extends InfrastructureError {
  public readonly code = 'tool_output_too_large';
  public readonly retryable = false;
}
