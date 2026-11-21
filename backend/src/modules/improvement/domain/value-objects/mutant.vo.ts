import type { FilePath } from '#kernel/primitives/file-path';

/**
 * A mutant by what it is: the file, the mutator, the place and the
 * replacement. The id a mutation tool gives it is not kept, because it
 * does not name the same mutant in another run.
 */
export interface Mutant {
  readonly file: FilePath;
  readonly mutator: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly replacement: string;
}

/** How a mutant went unnoticed: no test failed, or no test ran its code. */
export const MISSED_STATUSES = ['survived', 'no_coverage'] as const;

/** A mutant no existing test detects. */
export interface UndetectedMutant extends Mutant {
  readonly status: (typeof MISSED_STATUSES)[number];
}

/** A mutant the new tests still miss, as a place for the next attempt. */
export interface SurvivingMutant extends Mutant {
  /** Whether a new test runs the code of the mutant at all. */
  readonly reached: boolean;
}
