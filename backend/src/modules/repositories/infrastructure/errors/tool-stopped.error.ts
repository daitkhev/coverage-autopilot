import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A tool was stopped because its caller gave up, for a cancel or a
 * shutdown. The work itself did not fail, so it can run again.
 */
export class ToolStoppedError extends InfrastructureError {
  public readonly code = 'tool_stopped';
  public readonly retryable = true;
}
