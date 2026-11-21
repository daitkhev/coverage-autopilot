import type { FilePath } from '#kernel/primitives/file-path';
import type { MutantDto } from '#verification/contracts/verification-public-api';

/** A test by where it is and what it is called, never by the id of a tool. */
export interface TestReference {
  readonly file: FilePath;
  /** The full name: every `describe` around the test, then the test. */
  readonly name: string;
}

/**
 * `timeout` is its own status and never counts as detected. `error` is a
 * mutant the tool could not run, such as one that does not compile.
 */
type MutantStatus = 'killed' | 'survived' | 'no_coverage' | 'timeout' | 'error';

export interface MutantResult extends MutantDto {
  readonly status: MutantStatus;
  /** The tests that run the code of the mutant. */
  readonly coveredBy: readonly TestReference[];
  readonly killedBy: readonly TestReference[];
}

export interface MutationToolRequest {
  /**
   * The root of a working copy with its packages installed, lent for one
   * call. The runner may write into it and keeps no reference.
   */
  readonly workingCopyPath: string;
  /** Whose output the raw text of the tool is, such as `improvement:<id>`. */
  readonly owner: string;
  readonly testRunner: 'jest' | 'vitest';
}

/** `unsupported`: the tool cannot be installed beside the runner. */
export type MutationToolResult =
  | { readonly outcome: 'installed' }
  | {
      readonly outcome: 'unsupported';
      readonly detail: string;
      readonly outputReference: string | null;
    };

export interface MutationRunRequest extends MutationToolRequest {
  /** Only this file is mutated. */
  readonly targetFile: FilePath;
  /** The whole run is stopped from outside when it takes longer. */
  readonly timeoutMs: number;
}

export interface PatchedMutationRunRequest extends MutationRunRequest {
  /**
   * The cache a baseline run left, or `null`. The run starts from a copy
   * of it and never from the cache of another attempt.
   */
  readonly baselineCacheReference: string | null;
}

export interface CompletedMutationRun {
  readonly outcome: 'completed';
  readonly tool: {
    readonly name: string;
    readonly version: string;
    readonly testRunner: string;
  };
  /** Every mutant of the target file, sorted by position. */
  readonly mutants: readonly MutantResult[];
  /** Names the set of the mutants, whatever their statuses are. */
  readonly mutantSetHash: string;
  readonly cacheReference: string | null;
  readonly outputReference: string | null;
}

/**
 * `unsupported`: the tool cannot run on the project, such as when the
 * tests fail before any mutant or the tool is not installed in the copy.
 * `timed_out`: stopped at the time limit, with what it cached.
 */
export type MutationRunResult =
  | CompletedMutationRun
  | {
      readonly outcome: 'unsupported';
      readonly detail: string;
      readonly outputReference: string | null;
    }
  | {
      readonly outcome: 'timed_out';
      readonly cacheReference: string | null;
      readonly outputReference: string | null;
    };

/**
 * Runs a mutation tool on one file in the sandbox. The result holds no
 * absolute path, no colour code of a terminal and no stack trace. A fault,
 * such as a report that cannot be read, is a typed error with a `code`
 * and a `retryable` flag. An aborted signal stops the run and throws.
 */
export interface MutationRunner {
  /**
   * Installs the tool into the copy. It is the one step with an open
   * network, so it is called before any code of the repository runs in
   * the copy: right after the packages of the project are installed.
   */
  installTool(
    request: MutationToolRequest,
    signal: AbortSignal,
  ): Promise<MutationToolResult>;

  /**
   * The mutants of the target under the tests of the commit. The tool is
   * installed in the copy already, and no call here opens the network.
   */
  measureBaseline(
    request: MutationRunRequest,
    signal: AbortSignal,
  ): Promise<MutationRunResult>;

  /** The same mutants in a copy the patch was applied to. */
  measureWithPatch(
    request: PatchedMutationRunRequest,
    signal: AbortSignal,
  ): Promise<MutationRunResult>;
}

/** The injection token of the mutation runner. */
export const MUTATION_RUNNER = Symbol('MutationRunner');
