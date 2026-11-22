import type { RunTestsResult } from '#coverage/application/contracts/coverage-public-api';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** A test run and the words a check uses for it. */
interface TestRunReading {
  readonly name: CheckName;
  readonly run: RunTestsResult;
  /** The sentence for a run in which a test failed. */
  readonly failed: string;
  /** The sentence for a run stopped at the time limit. */
  readonly timedOut: string;
  /** How many runs a check that repeats made, or `null`. */
  readonly runs: number | null;
}

/**
 * The runner cannot run the commit it ran for the baseline. Nothing about
 * the patch can change that, so running again does not help.
 */
export function unsupportedRunOf(name: CheckName, detail: string): CheckResult {
  return CheckResult.error(name, {
    message: `The test runner cannot run the project: ${detail}`,
    retryable: false,
  });
}

/** Whether every test of the run passed. */
export function hasPassed(run: RunTestsResult): boolean {
  return run.outcome === 'completed' && run.testRun.status === 'passed';
}

/**
 * The result of a check that is one test run. A run past its time limit
 * says nothing about the patch, so it is an error worth running again.
 */
export function testRunResultOf(reading: TestRunReading): CheckResult {
  const { name, run, runs } = reading;
  if (run.outcome === 'unsupported') {
    return unsupportedRunOf(name, run.detail);
  }
  const { status, outputReference } = run.testRun;
  switch (status) {
    case 'passed':
      return CheckResult.passed(name, { runs, outputReference });
    case 'failed':
      return CheckResult.failed(name, reading.failed, {
        runs,
        outputReference,
      });
    case 'timed_out':
      return CheckResult.error(name, {
        message: reading.timedOut,
        retryable: true,
        runs,
        outputReference,
      });
  }
}
