/**
 * `none` is the rule: a test run and a mutation run reach nothing. `open`
 * is for the install of the packages alone, before any code of the
 * repository is run.
 */
type SandboxNetwork = 'none' | 'open';

export interface SandboxCommandRequest {
  /**
   * The root of a working copy, as an absolute path. The command sees it
   * at this same path, can write into it, and starts in it, so a path in
   * what a tool writes is a path of the host. It sees nothing else of the
   * host: not the data of the service, not its socket, not a credential.
   */
  readonly workingCopyPath: string;
  /** The program and its arguments. Never a line for a shell. */
  readonly command: readonly string[];
  /** Exactly the variables the command gets. Nothing is inherited. */
  readonly environment: Readonly<Record<string, string>>;
  readonly network: SandboxNetwork;
  /** The command is stopped when it runs longer than this. */
  readonly timeoutMs: number;
}

/**
 * A command that ran and failed is a result, not a fault: a failing test
 * is what a test run is for. `timed_out` has no exit code.
 */
export interface SandboxCommandResult {
  readonly outcome: 'exited' | 'timed_out';
  readonly exitCode: number | null;
  /**
   * What the command printed, both streams in the order they came. Only
   * the end is kept when there is more than the sandbox holds, and
   * `outputTruncated` says so.
   */
  readonly output: string;
  readonly outputTruncated: boolean;
  readonly durationMs: number;
}

/**
 * Runs a command of an untrusted repository apart from the host. A fault,
 * such as a sandbox that cannot start or one that may still run once its
 * command ended, is a typed error with a `code` and a `retryable` flag,
 * and the working copy is not to be read after it. An aborted signal
 * stops the command and throws.
 */
export interface Sandbox {
  run(
    request: SandboxCommandRequest,
    signal: AbortSignal,
  ): Promise<SandboxCommandResult>;
}

/** The injection token of the sandbox. */
export const SANDBOX = Symbol('Sandbox');
