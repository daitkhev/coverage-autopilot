import type {
  CoverageCounterDto,
  CoverageSnapshotDto,
  FailingTestDto,
  FileCoverageDto,
  MeasuredFileDto,
  RunCoverageDto,
  RunTestsResult,
  ScanParametersDto,
  TestFailureDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import {
  CAPTURED_AT,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { TARGET_FILE } from '#tests/support/verification-requests';

/** The tools every measurement of a verification test is made with. */
export const VITEST_PARAMETERS: ScanParametersDto = {
  testRunner: 'vitest',
  testRunnerVersion: '4.1.12',
  coverageProvider: 'v8',
  fileListRule: 'typescript-sources-v1',
};

const PERCENT = 100;

function counterOf(covered: number, total: number): CoverageCounterDto {
  return {
    covered,
    total,
    percentage: total === 0 ? null : (covered * PERCENT) / total,
  };
}

const HALF: CoverageCounterDto = { covered: 1, total: 2, percentage: 50 };

/** Covered and total of the lines of a file. Its other counters are 1 of 2. */
export interface LineCount {
  readonly covered: number;
  readonly total: number;
}

/** The target measured with these lines covered. */
export function measuredTarget(lines: LineCount): MeasuredFileDto {
  return {
    path: FilePath.create(TARGET_FILE),
    state: 'measured',
    counters: {
      statements: counterOf(lines.covered, lines.total),
      branches: HALF,
      functions: HALF,
      lines: counterOf(lines.covered, lines.total),
    },
    belowThreshold: true,
    uncoveredLines: [],
    openBranchLines: [],
    uncoveredFunctions: [],
  };
}

/** The baseline snapshot: lines are the metric of its threshold. */
export function snapshotDto(
  parameters: ScanParametersDto = VITEST_PARAMETERS,
): CoverageSnapshotDto {
  const empty = counterOf(0, 0);
  return {
    id: SNAPSHOT_ID,
    repositoryId: RepositoryId.create(REPOSITORY_ID),
    commit: CommitSha.create(SNAPSHOT_COMMIT),
    originKey: 'improvement:7:baseline',
    capturedAt: Instant.parse(CAPTURED_AT),
    project: {
      testRunner: 'vitest',
      testRunnerVersion: '4.1.12',
      packageManager: 'npm',
      configFile: null,
    },
    parameters,
    totals: {
      statements: empty,
      branches: empty,
      functions: empty,
      lines: empty,
    },
    threshold: { metric: 'lines', percentage: 80 },
    files: { below: 1, above: 0, unmeasured: 0, noCode: 0 },
    testRunOutput: null,
    tests: { ran: 4, failed: 0 },
  };
}

export function runCoverageOf(
  file: FileCoverageDto,
  parameters: ScanParametersDto = VITEST_PARAMETERS,
): RunCoverageDto {
  return { parameters, files: [file] };
}

/** The tests of the project that a run which passed ran. */
const RAN = 4;

/** A run that passed names its tests. Any other names none by default. */
function testRunDtoOf(status: TestRunDto['status']): TestRunDto {
  return {
    status,
    exitCode: status === 'passed' ? 0 : null,
    durationMs: 900,
    outputReference: `test-run-${status}`,
    firstFailure: null,
    outcomes: status === 'passed' ? { ran: RAN, failing: [] } : null,
  };
}

/** A test of the repository that fails, and a file of it that cannot run. */
export const FAILING_TESTS: readonly FailingTestDto[] = [
  {
    file: FilePath.create('tests/feed.test.ts'),
    test: 'feed > reads the feed',
  },
  { file: FilePath.create('tests/clock.test.ts'), test: null },
];

/** A run of all the tests in which these failed, of the ones that ran. */
export function failingRunOf(
  failing: readonly FailingTestDto[] = FAILING_TESTS,
): RunTestsResult {
  return {
    outcome: 'completed',
    testRun: {
      ...testRunDtoOf('failed'),
      exitCode: 1,
      outcomes: { ran: RAN, failing },
    },
    coverage: null,
  };
}

/** A run that ended so, with nothing measured. */
export function testRunOf(
  status: TestRunDto['status'],
  coverage: RunCoverageDto | null = null,
): RunTestsResult {
  return { outcome: 'completed', testRun: testRunDtoOf(status), coverage };
}

/** What a run of the new tests said first: its file failed to run. */
export const TEST_FAILURE: TestFailureDto = {
  file: FilePath.create('tests/helpers/utils.test.ts'),
  test: null,
  lines: [
    '● Test suite failed to run',
    "src/helpers/utils.ts:3:25 - error TS2307: Cannot find module 'crypto' or its corresponding type declarations.",
  ],
};

/** A run that failed, and what its runner said first. */
export function failedRunOf(
  failure: TestFailureDto = TEST_FAILURE,
): RunTestsResult {
  return {
    outcome: 'completed',
    testRun: { ...testRunDtoOf('failed'), firstFailure: failure },
    coverage: null,
  };
}

/** The runner cannot run the project at all. */
export const UNSUPPORTED_RUN: RunTestsResult = {
  outcome: 'unsupported',
  reason: 'no_test_runner',
  detail: 'No test runner is installed.',
};
