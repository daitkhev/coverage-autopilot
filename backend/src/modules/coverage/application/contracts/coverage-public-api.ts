import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';

type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines';

type TestRunnerName = 'jest' | 'vitest';

/**
 * Why a repository cannot be measured, as a value: the service reports
 * such a project and never changes it into one it can measure.
 */
export type UnsupportedProjectReason =
  | 'no_package_manifest'
  | 'invalid_package_manifest'
  | 'monorepo'
  | 'unsupported_package_manager'
  | 'no_lockfile'
  | 'no_test_runner'
  | 'other_test_runner'
  | 'ambiguous_test_runner'
  | 'no_coverage_provider';

export interface CoverageCounterDto {
  readonly covered: number;
  readonly total: number;
  /** `null` when the total is zero: no code of that kind is not 0%. */
  readonly percentage: number | null;
}

export type CoverageCountersDto = Readonly<
  Record<CoverageMetric, CoverageCounterDto>
>;

export interface CoverageThresholdDto {
  readonly metric: CoverageMetric;
  readonly percentage: number;
}

interface LineRangeDto {
  readonly start: number;
  readonly end: number;
}

interface UncoveredFunctionDto {
  readonly name: string;
  readonly line: number;
}

/** A measured file as a run of tests gives it: no threshold judged it. */
export interface MeasuredRunFileDto {
  readonly path: FilePath;
  readonly state: 'measured';
  readonly counters: CoverageCountersDto;
  readonly uncoveredLines: readonly LineRangeDto[];
  readonly openBranchLines: readonly number[];
  readonly uncoveredFunctions: readonly UncoveredFunctionDto[];
}

export interface MeasuredFileDto extends MeasuredRunFileDto {
  /**
   * Below the threshold its repository has at the moment of the read, so
   * the file can be a target.
   */
  readonly belowThreshold: boolean;
}

/** A file of type declarations alone. It is never a target. */
interface NoCodeFileDto {
  readonly path: FilePath;
  readonly state: 'no_executable_code';
}

/** No numbers that can be trusted, so no percentage at all. Never a target. */
export interface UnmeasuredFileDto {
  readonly path: FilePath;
  readonly state: 'unmeasured';
  readonly reason: 'parse_failed' | 'missing_from_report' | 'no_counters';
  readonly toolMessage: string | null;
}

export type FileCoverageDto =
  MeasuredFileDto | NoCodeFileDto | UnmeasuredFileDto;

/** A file of a run of tests, in any of the three states. */
export type RunFileDto = MeasuredRunFileDto | NoCodeFileDto | UnmeasuredFileDto;

export interface DetectedProjectDto {
  readonly testRunner: TestRunnerName;
  readonly testRunnerVersion: string;
  readonly packageManager: 'npm';
  readonly configFile: FilePath | null;
}

/** Numbers compare only between measurements with equal parameters. */
export interface ScanParametersDto {
  readonly testRunner: TestRunnerName;
  readonly testRunnerVersion: string;
  readonly coverageProvider: string;
  readonly fileListRule: string;
}

/** How the files of a snapshot divide under the threshold. */
export interface FileSplitDto {
  readonly below: number;
  readonly above: number;
  readonly unmeasured: number;
  readonly noCode: number;
}

export interface CoverageSnapshotDto {
  readonly id: string;
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  readonly originKey: string;
  readonly capturedAt: Instant;
  readonly project: DetectedProjectDto;
  readonly parameters: ScanParametersDto;
  /** Over measured files only. */
  readonly totals: CoverageCountersDto;
  readonly threshold: CoverageThresholdDto;
  readonly files: FileSplitDto;
  /** The reference of the raw output of the test run in the artifact store. */
  readonly testRunOutput: string | null;
}

interface UnsupportedProjectDto {
  readonly outcome: 'unsupported';
  readonly reason: UnsupportedProjectReason;
  readonly detail: string;
}

export interface CaptureSnapshotRequest {
  readonly repositoryId: RepositoryId;
  readonly commit: CommitSha;
  /**
   * The id of the job or of the improvement that asks, such as
   * `improvement:<id>:baseline`. Asked again with the same key, the call
   * returns the snapshot it stored and measures nothing.
   */
  readonly originKey: string;
}

/**
 * `test_run_timed_out`: the tests ran past the time limit of the settings.
 * `coverage_report_missing`: the runner ended and wrote no report, so a
 * snapshot would hold no number. Its output says why.
 */
export type CaptureSnapshotResult =
  | { readonly outcome: 'captured'; readonly snapshot: CoverageSnapshotDto }
  | UnsupportedProjectDto
  | {
      readonly outcome:
        'install_failed' | 'test_run_timed_out' | 'coverage_report_missing';
      readonly outputReference: string | null;
    };

export interface WorkingCopyLoan {
  /**
   * The root of a working copy the caller owns and lends for one call.
   * The call may write into it, such as a report, and keeps no reference.
   */
  readonly workingCopyPath: string;
  /** Whose output the raw text of a tool is, such as `improvement:<id>`. */
  readonly owner: string;
}

export type PrepareProjectResult =
  | {
      readonly outcome: 'ready';
      readonly project: DetectedProjectDto;
      readonly parameters: ScanParametersDto;
    }
  | UnsupportedProjectDto
  | {
      readonly outcome: 'install_failed';
      /** `null` when the install ran out of time. */
      readonly exitCode: number | null;
      readonly outputReference: string | null;
    };

export interface RunTestsRequest extends WorkingCopyLoan {
  /** The test files to run, or every test of the project when empty. */
  readonly testFiles: readonly FilePath[];
  /** Measure the files the way a snapshot does. */
  readonly withCoverage: boolean;
}

/**
 * `failed` is a result, not a fault: some test failed, or the runner
 * stopped with an error of its own.
 */
export interface TestRunDto {
  readonly status: 'passed' | 'failed' | 'timed_out';
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly outputReference: string | null;
}

/**
 * A run is lent a working copy and knows no repository, so no threshold
 * judges its files: the gate compares their numbers with a snapshot.
 */
export interface RunCoverageDto {
  readonly parameters: ScanParametersDto;
  /** Every eligible file in one of the three states, sorted by path. */
  readonly files: readonly RunFileDto[];
}

export type RunTestsResult =
  | {
      readonly outcome: 'completed';
      readonly testRun: TestRunDto;
      /** `null` when coverage was not asked for or the run timed out. */
      readonly coverage: RunCoverageDto | null;
    }
  | UnsupportedProjectDto;

export interface SnapshotRequest {
  readonly snapshotId: string;
}

export interface FileCoverageRequest extends SnapshotRequest {
  readonly path: FilePath;
}

/**
 * Project detection, test runs with coverage, snapshots and thresholds,
 * as the other modules see them.
 *
 * `null` means not found, a value with an `outcome` is an expected result,
 * and a fault is a typed error with a `code` and a `retryable` flag. An
 * operation that runs a tool takes a signal, stops, releases what it
 * holds and throws.
 */
export interface CoveragePublicApi {
  /** Clones the commit, installs, runs every test with coverage and stores. */
  captureSnapshot(
    request: CaptureSnapshotRequest,
    signal: AbortSignal,
  ): Promise<CaptureSnapshotResult>;

  /** Detects the runner and installs the packages of a lent working copy. */
  prepareProject(
    request: WorkingCopyLoan,
    signal: AbortSignal,
  ): Promise<PrepareProjectResult>;

  /** Runs tests in a prepared working copy. Nothing is stored. */
  runTests(
    request: RunTestsRequest,
    signal: AbortSignal,
  ): Promise<RunTestsResult>;

  getSnapshot(request: SnapshotRequest): Promise<CoverageSnapshotDto | null>;

  /** `null` when the snapshot is not there or does not list the file. */
  getFileCoverage(
    request: FileCoverageRequest,
  ): Promise<FileCoverageDto | null>;
}

/** The injection token of the contract of the coverage module. */
export const COVERAGE_PUBLIC_API = Symbol('CoveragePublicApi');
