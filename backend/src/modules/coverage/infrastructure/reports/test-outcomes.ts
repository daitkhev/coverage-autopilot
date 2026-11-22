import type {
  FailingTest,
  TestOutcomes,
} from '#coverage/application/ports/test-report-reader.port';
import {
  FAILED,
  failuresOf,
  plainName,
  type ReportedFailure,
  testFileOf,
} from '#coverage/infrastructure/reports/reported-failures';
import type { TestReport } from '#coverage/infrastructure/reports/test-report.schema';

const PASSED = 'passed';

/** A test that was skipped, left out or only planned did not run. */
function ranTestsOf(report: TestReport): number {
  return report.testResults
    .flatMap((file) => file.assertionResults)
    .filter(({ status }) => status === PASSED || status === FAILED).length;
}

function keyOf(test: FailingTest): string {
  return JSON.stringify([test.file.value, test.test]);
}

/**
 * The failures as tests, each once, or `null` when one of them is in no
 * file of the copy and so cannot be named.
 */
function failingOf(
  failures: readonly ReportedFailure[],
  roots: readonly string[],
): FailingTest[] | null {
  const failing = new Map<string, FailingTest>();
  for (const failure of failures) {
    const file = testFileOf(failure.file, roots);
    if (file === null) {
      return null;
    }
    const test = { file, test: plainName(failure.test, roots) };
    failing.set(keyOf(test), test);
  }
  return [...failing.values()];
}

/**
 * Which tests of a report ran and which of them failed, each named the
 * way the run of another copy of the same commit names it, so that two
 * runs can be compared test by test. A file that failed to run counts as
 * one test that ran and failed.
 */
export function testOutcomesOf(
  report: TestReport,
  roots: readonly string[],
): TestOutcomes | null {
  const failures = failuresOf(report);
  const failing = failingOf(failures, roots);
  const filesNotRun = failures.filter(({ test }) => test === null).length;
  return failing === null
    ? null
    : { ran: ranTestsOf(report) + filesNotRun, failing };
}
