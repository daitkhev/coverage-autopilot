import { describe, expect, it } from 'vitest';

import type {
  FailingTestDto,
  RunTestsResult,
  TestFailureDto,
} from '#coverage/application/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import {
  FAILING_TESTS,
  failingRunOf,
  testRunOf,
} from '#tests/support/verification-coverage';
import {
  baselineOf,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { ExistingTestsCheck } from '#verification/application/commands/verify-patch/checks/existing-tests-check';
import type { VerificationBaselineDto } from '#verification/application/contracts/verification-public-api';

const RUNNING = new AbortController().signal;

const BROKEN: FailingTestDto = {
  file: FilePath.create('tests/price.test.ts'),
  test: 'price > rounds',
};

const LEFT_OUT = 'Left out: 2 that failed before the patch.';

/** What a run said first about a test. */
function failureOf(test: FailingTestDto): TestFailureDto {
  return { ...test, lines: ['AssertionError: expected 2 to be 3'] };
}

function withFirstFailure(
  run: RunTestsResult,
  failure: TestFailureDto,
): RunTestsResult {
  return run.outcome === 'completed'
    ? { ...run, testRun: { ...run.testRun, firstFailure: failure } }
    : run;
}

describe('ExistingTestsCheck', () => {
  const check = new ExistingTestsCheck();

  /** The check of a copy whose baseline is so, after the full run. */
  async function checked(
    baseline: Partial<VerificationBaselineDto>,
    run: RunTestsResult,
  ) {
    const application = verificationApplication();
    const command = verifyRequestOf({ baseline: baselineOf(baseline) });
    const { copy } = patchedCopyOf(application, { command });
    application.coverage.answers.push(run);
    return check.run(copy, RUNNING);
  }

  async function checkedAfterFailures(run: RunTestsResult) {
    return checked(
      { existingTests: 'failed', failingTests: FAILING_TESTS },
      run,
    );
  }

  describe('inapplicability', () => {
    it('should compare only with a commit whose failing tests are known', () => {
      const application = verificationApplication();
      const reasonFor = (
        baseline: Partial<VerificationBaselineDto>,
      ): string | null =>
        check.inapplicability(
          patchedCopyOf(application, {
            command: verifyRequestOf({ baseline: baselineOf(baseline) }),
          }).copy,
        );

      expect(reasonFor({})).toBeNull();
      expect(
        reasonFor({ existingTests: 'failed', failingTests: FAILING_TESTS }),
      ).toBeNull();
      expect(
        reasonFor({ existingTests: 'failed', failingTests: null }),
      ).toContain('Some tests of the commit failed');
      expect(
        reasonFor({ existingTests: 'timed_out', failingTests: null }),
      ).toContain('ran out of time before the patch');
    });
  });

  describe('run', () => {
    it('should read the run of every test that the copy shares', async () => {
      const application = verificationApplication();
      const { copy } = patchedCopyOf(application);
      application.coverage.answers.push(testRunOf('failed'));

      const result = await check.run(copy, RUNNING);
      await copy.fullRun.result(RUNNING);

      expect(result.message).toBe(
        'Tests of the project fail with the new tests.',
      );
      expect(application.coverage.runs).toHaveLength(1);
      expect(application.coverage.runs[0]?.testFiles).toEqual([]);
    });
  });

  describe('run, when tests failed before the patch', () => {
    it('should pass when only they fail, and say how many were left out', async () => {
      const result = await checkedAfterFailures(failingRunOf());

      expect(result.status).toBe('passed');
      expect(result.message).toBe(LEFT_OUT);
      expect(result.outputReference).toBe('test-run-failed');
    });

    it('should pass when every test passes with the patch', async () => {
      const result = await checkedAfterFailures(testRunOf('passed'));

      expect([result.status, result.message]).toEqual(['passed', LEFT_OUT]);
    });

    it('should leave out any test of a file that failed to run before', async () => {
      const clock = FilePath.create('tests/clock.test.ts');

      const result = await checkedAfterFailures(
        failingRunOf([{ file: clock, test: 'clock > ticks' }]),
      );

      expect(result.status).toBe('passed');
    });

    it('should fail on a test that passed before, and name it', async () => {
      const run = failingRunOf([...FAILING_TESTS, BROKEN]);

      const result = await checkedAfterFailures(
        withFirstFailure(run, failureOf(BROKEN)),
      );

      expect(result.status).toBe('failed');
      expect(result.message).toBe(
        'Tests that passed before the patch fail with it: 1. The first is ' +
          `"price > rounds" in tests/price.test.ts. ${LEFT_OUT}`,
      );
      expect(result.testFailure).toEqual(failureOf(BROKEN));
    });

    it('should not give the generator a failure the patch did not cause', async () => {
      const [before] = FAILING_TESTS;
      const run = failingRunOf([...FAILING_TESTS, BROKEN]);

      const result = await checkedAfterFailures(
        withFirstFailure(run, failureOf(before ?? BROKEN)),
      );

      expect(result.status).toBe('failed');
      expect(result.testFailure).toBeNull();
    });

    it('should fail a run that failed and named no test', async () => {
      const result = await checkedAfterFailures(testRunOf('failed'));

      expect(result.status).toBe('failed');
      expect(result.message).toBe(
        'Tests of the project fail with the new tests. Their runner named ' +
          'no test, so the tests that failed before the patch cannot be ' +
          'left out.',
      );
    });

    it('should answer a run that ran out of time as an error', async () => {
      const result = await checkedAfterFailures(testRunOf('timed_out'));

      expect([result.status, result.retryable]).toEqual(['error', true]);
    });
  });
});
