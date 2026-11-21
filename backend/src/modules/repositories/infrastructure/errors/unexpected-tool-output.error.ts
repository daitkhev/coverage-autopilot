import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/** A tool said it succeeded and printed what the module cannot read. */
export class UnexpectedToolOutputError extends InfrastructureError {
  public readonly code = 'unexpected_tool_output';
  public readonly retryable = false;
}
