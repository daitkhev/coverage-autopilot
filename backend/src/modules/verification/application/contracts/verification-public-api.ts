import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';

/** The seven checks of the quality gate, in the order they run. */
export type CheckName =
  | 'test_files_only'
  | 'type_check'
  | 'new_tests_pass'
  | 'existing_tests_pass'
  | 'repeated_runs'
  | 'coverage_increase'
  | 'mutation_gain';

/**
 * `failed`: the patch is at fault. `skipped`: the policy does not require
 * the check. `not_applicable`: the check has nothing to examine. `error`:
 * the check could not finish, so it says nothing about the patch.
 */
export type CheckStatus =
  'passed' | 'failed' | 'skipped' | 'not_applicable' | 'error';

/** The settings of the gate, fixed when an improvement is created. */
export interface QualityPolicyDto {
  /** A check that is not listed is `skipped`. */
  readonly requiredChecks: readonly CheckName[];
  /** How many runs in a row the new tests must pass. */
  readonly repeatedRuns: number;
  /** The least kill rate of the new tests, as a percentage. */
  readonly mutationThreshold: number;
}

/**
 * A mutant by what it is, never by the id of a tool: the id of a tool is
 * kept for diagnostics alone and does not cross this boundary.
 */
export interface MutantDto {
  readonly file: FilePath;
  readonly mutator: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly replacement: string;
}

/** A mutant no existing test detects. */
export interface UndetectedMutantDto extends MutantDto {
  readonly status: 'survived' | 'no_coverage';
}

/** Both runs of one improvement must name the same tool and runner. */
interface MutationToolDto {
  readonly name: string;
  readonly version: string;
  readonly testRunner: string;
}

export interface MutationBaselineDto {
  readonly tool: MutationToolDto;
  /** Every mutant of the target file, detected or not. */
  readonly totalMutants: number;
  /**
   * Names the whole set of mutants. A run with the patch that gives
   * another one is an incomplete report, not a rejection.
   */
  readonly mutantSetHash: string;
  readonly undetected: readonly UndetectedMutantDto[];
  /**
   * The cache of the tool in the artifact store, or `null`. It only
   * saves time: a run that lost it starts again and gives the same result.
   */
  readonly cacheReference: string | null;
}

/**
 * What the commit is like before any patch. It is measured once for an
 * improvement and every attempt is compared with it, so the caller keeps
 * it and gives it back unchanged.
 */
export interface VerificationBaselineDto {
  readonly commit: CommitSha;
  readonly targetFile: FilePath;
  /** `absent`: the project has no compiler or no configuration of one. */
  readonly typeCheck: 'passes' | 'fails' | 'absent';
  readonly existingTests: 'passed' | 'failed' | 'timed_out';
  /** `null` when the policy does not require the mutation check. */
  readonly mutation: MutationBaselineDto | null;
}

type BaselineStep =
  'prepare' | 'type_check' | 'existing_tests' | 'mutation_baseline';

export interface BaselineProgress {
  readonly step: BaselineStep;
  readonly status: 'running' | 'done';
}

/** `done` and `total` are for a check that repeats, such as run 2 of 3. */
export interface CheckProgress {
  readonly check: CheckName;
  readonly status: 'running' | CheckStatus;
  readonly done?: number;
  readonly total?: number;
}

/**
 * One listener for one call. It is a hint for a person: nothing breaks
 * when a call of it is missed, and it must not throw.
 */
export type ProgressObserver<Progress> = (progress: Progress) => void;

export interface MeasureBaselineRequest {
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  readonly targetFile: FilePath;
  readonly policy: QualityPolicyDto;
  /** The work is stopped from outside when this moment passes. */
  readonly deadline: Instant;
  /** Whose work it is, such as `improvement:<id>`, for folders and logs. */
  readonly owner: string;
  readonly onProgress?: ProgressObserver<BaselineProgress>;
}

/**
 * `unsupported`: the commit cannot be verified at all, and no token should
 * be spent on it. `timed_out`: the deadline passed before the end.
 */
export type MeasureBaselineResult =
  | {
      readonly outcome: 'measured';
      readonly baseline: VerificationBaselineDto;
    }
  | {
      readonly outcome: 'unsupported';
      readonly reason:
        'project_unsupported' | 'install_failed' | 'mutation_unsupported';
      readonly detail: string;
      readonly outputReference: string | null;
    }
  | { readonly outcome: 'timed_out' };

export interface VerifyPatchRequest {
  readonly repositoryId: RepositoryId;
  readonly baseCommit: CommitSha;
  readonly patch: { readonly text: string; readonly hash: string };
  readonly targetFile: FilePath;
  /**
   * How the name of a test file ends, such as `.test.ts`. The patch may
   * only add new plain files whose paths end with one of them.
   */
  readonly testFileSuffixes: readonly string[];
  /** The snapshot of the same commit the coverage is compared with. */
  readonly baselineSnapshotId: string;
  readonly baseline: VerificationBaselineDto;
  readonly policy: QualityPolicyDto;
  readonly deadline: Instant;
  /** Such as `improvement:<id>:attempt:2`. */
  readonly owner: string;
  readonly onProgress?: ProgressObserver<CheckProgress>;
}

/**
 * The failure a run of tests named first: text of the repository, without
 * the codes of a terminal and the path of the working copy, cut to a few
 * short lines.
 */
interface TestFailureDto {
  readonly file: FilePath;
  /** The names of the test that failed, `null` when the file failed to run. */
  readonly test: string | null;
  /** At least one. */
  readonly lines: readonly string[];
}

export interface CheckResultDto {
  readonly name: CheckName;
  readonly status: CheckStatus;
  /** Matters for `error` alone: whether running the check again can help. */
  readonly retryable: boolean;
  readonly durationMs: number | null;
  /** How many runs the check made, or `null` when it does not repeat. */
  readonly runs: number | null;
  readonly message: string | null;
  /** The raw output of the tool in the artifact store. */
  readonly outputReference: string | null;
  /**
   * Of a `failed` check that is a run of tests, what the run said first.
   * `null` for any other check, and when the runner named no failure.
   */
  readonly testFailure: TestFailureDto | null;
}

interface CoverageCounterDto {
  readonly covered: number;
  readonly total: number;
}

export type TargetCoverageDto = Readonly<
  Record<'statements' | 'branches' | 'functions' | 'lines', CoverageCounterDto>
>;

/** What the new tests add, not the score a mutation tool prints. */
export interface MutantCountsDto {
  readonly undetectedBefore: number;
  /** Undetected before, killed with the patch. */
  readonly killed: number;
  /** Undetected before, run by a new test, and not timed out. */
  readonly reached: number;
  readonly timedOut: number;
}

/** A mutant the new tests still do not detect, as a place to aim at. */
export interface SurvivingMutantDto extends MutantDto {
  /** Whether a new test runs the code of the mutant at all. */
  readonly reached: boolean;
}

/**
 * The results of every check for one patch. `accepted` and `rejected`
 * come only from a complete report: a required check that ended in
 * `error` makes the verdict `inconclusive`.
 */
export interface VerificationReportDto {
  /** Repeats the hash of the request: the text that was verified. */
  readonly patchHash: string;
  readonly verdict: 'accepted' | 'rejected' | 'inconclusive';
  /** A sentence for each required check that did not pass. */
  readonly reasons: readonly string[];
  /** All seven, in the order of `CheckName`. */
  readonly checks: readonly CheckResultDto[];
  /** `null` when the coverage check did not get that far. */
  readonly coverageBefore: TargetCoverageDto | null;
  readonly coverageAfter: TargetCoverageDto | null;
  readonly mutants: MutantCountsDto | null;
  /** At most a fixed number of them, the reached ones first. */
  readonly survivingMutants: readonly SurvivingMutantDto[];
}

/**
 * The quality gate, as the improvement module sees it. The module stores
 * nothing: the caller keeps the baseline and the report.
 *
 * A value with an `outcome` or a verdict is an expected result, and a
 * fault is a typed error with a `code` and a `retryable` flag. Neither
 * operation retries on its own. Both make and dispose of their own
 * working copies, stop when the signal aborts, and then throw.
 */
export interface VerificationPublicApi {
  /** Installs, type-checks, runs the tests and measures the mutants. */
  measureBaseline(
    request: MeasureBaselineRequest,
    signal: AbortSignal,
  ): Promise<MeasureBaselineResult>;

  /** Applies the patch to a clean clone and runs the seven checks. */
  verifyPatch(
    request: VerifyPatchRequest,
    signal: AbortSignal,
  ): Promise<VerificationReportDto>;
}

/** The injection token of the contract of the verification module. */
export const VERIFICATION_PUBLIC_API = Symbol('VerificationPublicApi');
