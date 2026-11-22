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
 * Reads the JSON report of the tests of a run, which Jest and Vitest
 * write in one shape. The report is outside data: what leaves the reader
 * is cleaned and cut. It only helps the next attempt, so a report that
 * cannot be read gives nothing and never fails the run.
 */
export interface TestReportReader {
  /** `null` when there is no report that names a failure with words. */
  firstFailure(request: TestReportRequest): Promise<TestFailure | null>;
}

/** The injection token of the reader of the reports of tests. */
export const TEST_REPORT_READER = Symbol('TestReportReader');
