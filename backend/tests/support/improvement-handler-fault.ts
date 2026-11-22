import { InfrastructureError } from '#kernel/errors/infrastructure.error';

interface FaultSpec {
  readonly message: string;
  readonly retryable: boolean;
}

/** A fault of a tool below the improvement, which may pass or not. */
export class ToolFault extends InfrastructureError {
  public readonly code = 'tool_unavailable';
  public readonly retryable: boolean;

  public constructor(spec: FaultSpec) {
    super(spec.message);
    this.retryable = spec.retryable;
  }
}
