import { FilePath } from '#kernel/primitives/file-path';
import {
  NEW_TEST_FILE,
  TARGET_FILE,
} from '#tests/support/verification-requests';
import type {
  MutantDto,
  MutationBaselineDto,
  UndetectedMutantDto,
} from '#verification/application/contracts/verification-public-api';
import type {
  CompletedMutationRun,
  MutantResult,
  TestReference,
} from '#verification/application/ports/mutation-runner.port';

/** The tool both runs of an improvement name. */
export const TOOL = {
  name: 'stryker',
  version: '10.1.1',
  testRunner: 'vitest',
} as const;

export const MUTANT_SET = 'mutant-set-1';

/** A test of the commit. */
export const OLD_TEST = 'src/old.test.ts';

type Status = MutantResult['status'];

/** A `>` turned into `>=` on the line a test names. */
export function mutantAt(line: number): MutantDto {
  return {
    file: FilePath.create(TARGET_FILE),
    mutator: 'EqualityOperator',
    startLine: line,
    startColumn: 4,
    endLine: line,
    endColumn: 9,
    replacement: 'a >= b',
  };
}

function testsIn(files: readonly string[]): TestReference[] {
  return files.map((file) => ({
    file: FilePath.create(file),
    name: `widgets ${file}`,
  }));
}

export interface MutantSpec {
  readonly line: number;
  readonly status: Status;
  /** The files of the tests that run the mutant. */
  readonly coveredBy?: readonly string[];
  readonly killedBy?: readonly string[];
}

export function mutantResultOf(spec: MutantSpec): MutantResult {
  return {
    ...mutantAt(spec.line),
    status: spec.status,
    coveredBy: testsIn(spec.coveredBy ?? []),
    killedBy: testsIn(spec.killedBy ?? []),
  };
}

/** A mutant the new test file runs and kills. */
export function killedByNewTest(line: number): MutantResult {
  return mutantResultOf({
    line,
    status: 'killed',
    coveredBy: [NEW_TEST_FILE],
    killedBy: [NEW_TEST_FILE],
  });
}

export function completedRunOf(
  mutants: readonly MutantResult[],
  overrides: Partial<CompletedMutationRun> = {},
): CompletedMutationRun {
  return {
    outcome: 'completed',
    tool: TOOL,
    mutants,
    mutantSetHash: MUTANT_SET,
    cacheReference: 'mutation-cache',
    outputReference: 'mutation-output',
    ...overrides,
  };
}

interface UndetectedSpec {
  readonly line: number;
  readonly status: UndetectedMutantDto['status'];
}

function undetectedAt(spec: UndetectedSpec): UndetectedMutantDto {
  return { ...mutantAt(spec.line), status: spec.status };
}

/**
 * The baseline of a target with five mutants: those on lines 1 and 2 are
 * detected by an old test, and those on lines 3, 4 and 5 are not.
 */
export function mutationBaselineDto(): MutationBaselineDto {
  return {
    tool: TOOL,
    totalMutants: 5,
    mutantSetHash: MUTANT_SET,
    undetected: [
      undetectedAt({ line: 3, status: 'survived' }),
      undetectedAt({ line: 4, status: 'no_coverage' }),
      undetectedAt({ line: 5, status: 'survived' }),
    ],
    cacheReference: 'mutation-cache',
  };
}

/** The lines of the mutants of `mutationBaselineDto` no test detects. */
export function undetectedLines(): number[] {
  return mutationBaselineDto().undetected.map((mutant) => mutant.startLine);
}

/** The run on the commit that gives `mutationBaselineDto`. */
export function baselineRun(): CompletedMutationRun {
  return completedRunOf([
    mutantResultOf({ line: 1, status: 'killed', killedBy: [OLD_TEST] }),
    mutantResultOf({ line: 2, status: 'timeout', coveredBy: [OLD_TEST] }),
    mutantResultOf({ line: 3, status: 'survived', coveredBy: [OLD_TEST] }),
    mutantResultOf({ line: 4, status: 'no_coverage' }),
    mutantResultOf({ line: 5, status: 'survived', coveredBy: [OLD_TEST] }),
  ]);
}
