export interface TypeCheckRequest {
  /** The root of a working copy whose packages are installed. */
  readonly workingCopyPath: string;
  /** Whose output the raw text of the compiler is, such as `improvement:<id>`. */
  readonly owner: string;
  /** The compiler is stopped when it runs longer than this. */
  readonly timeoutMs: number;
}

/**
 * `absent`: the project has no compiler or no configuration of one at its
 * root, so nothing was run. `fails` is a result, not a fault: the compiler
 * ran and found errors.
 */
export type TypeCheckResult =
  | { readonly outcome: 'absent' }
  | {
      readonly outcome: 'passes' | 'fails' | 'timed_out';
      readonly durationMs: number;
      /** The raw output of the compiler in the artifact store. */
      readonly outputReference: string;
    };

/**
 * Type-checks a working copy with the project's own compiler, in the
 * sandbox and with no network. A fault, such as a sandbox that cannot
 * start, is a typed error. An aborted signal stops the run and throws.
 */
export interface TypeChecker {
  check(
    request: TypeCheckRequest,
    signal: AbortSignal,
  ): Promise<TypeCheckResult>;
}

/** The injection token of the type checker. */
export const TYPE_CHECKER = Symbol('TypeChecker');
