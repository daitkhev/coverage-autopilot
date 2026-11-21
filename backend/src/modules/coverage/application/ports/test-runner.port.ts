import type {
  DetectedProject,
  TestRunnerName,
} from '#coverage/domain/value-objects/detected-project.vo';
import type { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { SandboxCommandResult } from '#ports/sandbox.port';

export interface TestRunRequest {
  /** A working copy whose packages are installed. */
  readonly workingCopyPath: string;
  readonly project: DetectedProject;
  readonly parameters: ScanParameters;
  /** The test files to run, or every test of the project when empty. */
  readonly testFiles: readonly FilePath[];
  /**
   * The files to measure, named one by one: without the list a runner
   * leaves out every file no test imports. `null` runs without coverage.
   */
  readonly coverageFiles: readonly FilePath[] | null;
}

export interface TestRunOutput {
  /** A failing test is a result: the command ran and said so. */
  readonly result: SandboxCommandResult;
  /** Where the runner was told to write its JSON report, or `null`. */
  readonly reportPath: string | null;
}

/** Runs the tests of one runner in the sandbox, with no network. */
export interface TestRunner {
  readonly testRunner: TestRunnerName;
  run(request: TestRunRequest, signal: AbortSignal): Promise<TestRunOutput>;
}

/** The injection token of the list of every test runner. */
export const TEST_RUNNERS = Symbol('TestRunners');
