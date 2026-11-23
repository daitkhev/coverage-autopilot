import type { ClientSession } from '#api/client-session';

/**
 * What the entry file hands a command: the service, the two streams and
 * the way to wait. A command reads no process and no environment itself,
 * so a test hands it all of this.
 */
export interface CommandIo {
  readonly session: ClientSession;
  /** Standard output: the result, and nothing else. */
  readonly out: (line: string) => void;
  /** Standard error: progress and diagnostics. */
  readonly err: (line: string) => void;
  /** Waits between two questions of `--wait`. */
  readonly pause: (ms: number) => Promise<void>;
  /** `--json`: the result is the value of the contract, one document. */
  readonly json: boolean;
  /** Off where the terminal cannot show Unicode: every symbol is then ASCII. */
  readonly unicode: boolean;
}

/** The exit codes of the document: done, failed, and a wrong command line. */
export const EXIT_CODE = { done: 0, failed: 1, wrongLine: 2 } as const;
