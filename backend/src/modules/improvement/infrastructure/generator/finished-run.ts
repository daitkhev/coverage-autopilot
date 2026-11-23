import type { CliStream } from '#improvement/infrastructure/generator/claude-stream';
import type { GeneratorCredential } from '#improvement/infrastructure/generator/generator-settings';
import type { Instant } from '#kernel/time/instant';
import type { SandboxCommandResult } from '#ports/sandbox.port';

/** Everything known of one run of the CLI once the sandbox gave it back. */
export interface FinishedRun {
  readonly ended: SandboxCommandResult;
  readonly stream: CliStream;
  /** Whether the run added, changed or removed an entry of the copy. */
  readonly changed: boolean;
  /** Whether a written file holds the credential. */
  readonly exposed: boolean;
  /** The raw output in the artifact store, without the credential. */
  readonly outputReference: string;
}

/** What a run is judged by. */
export interface RunRules {
  readonly allowedTools: readonly string[];
  readonly credential: GeneratorCredential;
  readonly now: Instant;
}
