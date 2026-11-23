import { InfrastructureError } from '#kernel/errors/infrastructure.error';

interface FaultSpec {
  readonly message: string;
  readonly retryable: boolean;
  /** The code of a fault a module names, `tool_unavailable` if none. */
  readonly code?: string;
}

/** A fault of a tool below the improvement, which may pass or not. */
export class ToolFault extends InfrastructureError {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(spec: FaultSpec) {
    super(spec.message);
    this.code = spec.code ?? 'tool_unavailable';
    this.retryable = spec.retryable;
  }
}

/** What the repositories module throws for a copy with a `.git` of its own. */
export function tamperedCopyFault(): ToolFault {
  return new ToolFault({
    message: 'The tree holds a .git of its own.',
    retryable: false,
    code: 'working_copy_tampered',
  });
}
