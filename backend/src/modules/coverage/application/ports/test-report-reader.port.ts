import type { FilePath } from '#kernel/primitives/file-path';

export interface TestReportRequest {
  readonly workingCopyPath: string;
  /** The absolute path of the report of the tests the runner was told to write. */
  readonly reportPath: string;
}

/** The failure a report names first, cleaned and cut. */
export interface TestFailure {
  readonly file: FilePath;
  /** `null` when the file failed to run. */
  readonly test: string | null;
  /** At least one. */
  readonly lines: readonly string[];
}

/**
 * A test that failed, by its file and its full name: every `describe`
 * around it, then the test. A file that failed to run has no name and
 * counts as one test.
 */
export interface FailingTest {
  readonly file: FilePath;
  readonly test: string | null;
}

/** Which tests of a run ran, and which of them failed. */
export interface TestOutcomes {
  /** Those that passed or failed, a file that failed to run as one. */
  readonly ran: number;
  /** In the order of the report, each test once. */
  readonly failing: readonly FailingTest[];
}

/**
 * Reads the JSON report of the tests of a run, which Jest and Vitest
 * write in one shape. The report is outside data: what leaves the reader
 * is cleaned and cut. A report that cannot be read gives nothing and
 * never fails the run.
 */
export interface TestReportReader {
  /** `null` when there is no report that names a failure with words. */
  firstFailure(request: TestReportRequest): Promise<TestFailure | null>;
  /**
   * `null` when there is no report, or one that names a test in no file
   * of the copy: then no failure can be told from another.
   */
  outcomes(request: TestReportRequest): Promise<TestOutcomes | null>;
}

/** The injection token of the reader of the reports of tests. */
export const TEST_REPORT_READER = Symbol('TestReportReader');
