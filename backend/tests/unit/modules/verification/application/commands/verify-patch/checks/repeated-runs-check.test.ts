import { describe, expect, it } from 'vitest';

import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import { testRunOf } from '#tests/support/verification-coverage';
import { HOUR_MS } from '#tests/support/verification-requests';
import { RepeatedRunsCheck } from '#verification/application/commands/verify-patch/checks/repeated-runs-check';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';

const RUNNING = new AbortController().signal;

function benchOf() {
  const application = verificationApplication();
  const check = new RepeatedRunsCheck(application.coverage);
  return { application, check, ...patchedCopyOf(application) };
}

describe('RepeatedRunsCheck', () => {
  describe('inapplicability', () => {
    it('should not run again new tests that did not pass once', () => {
      const { check, copy } = benchOf();

      expect(check.inapplicability(copy)).toBeNull();
      copy.book.record(CheckResult.failed('new_tests_pass', 'They fail.'));
      expect(check.inapplicability(copy)).toBe(
        'The new tests did not pass once, so they were not run again.',
      );
    });

    it('should not run again new tests that could not finish', () => {
      const { check, copy } = benchOf();
      copy.book.record(
        CheckResult.error('new_tests_pass', {
          message: 'Late.',
          retryable: true,
        }),
      );

      expect(check.inapplicability(copy)).not.toBeNull();
    });
  });

  describe('run', () => {
    it('should pass after as many runs in a row as the policy asks', async () => {
      const { application, check, copy, heard } = benchOf();

      const result = await check.run(copy, RUNNING);

      expect(result.status).toBe('passed');
      expect(result.runs).toBe(3);
      expect(result.outputReference).toBe('test-run-passed');
      expect(
        application.coverage.runs.map(({ testFiles }) => testFiles),
      ).toEqual([copy.newTestFiles, copy.newTestFiles, copy.newTestFiles]);
      expect(heard.map(({ done, total }) => [done, total])).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
    });

    describe('when a run fails', () => {
      it('should fail, name the run and stop', async () => {
        const { application, check, copy } = benchOf();
        application.coverage.answers.push(
          testRunOf('passed'),
          testRunOf('failed'),
        );

        const result = await check.run(copy, RUNNING);

        expect(result.message).toBe('The new tests failed on run 2 of 3.');
        expect(result.runs).toBe(2);
        expect(application.coverage.runs).toHaveLength(2);
      });
    });

    describe('when a run is stopped at its limit', () => {
      it('should be an error worth running again', async () => {
        const { application, check, copy } = benchOf();
        application.coverage.answers.push(testRunOf('timed_out'));

        const result = await check.run(copy, RUNNING);

        expect(result.status).toBe('error');
        expect(result.message).toBe(
          'The new tests ran out of time on run 1 of 3.',
        );
      });
    });

    describe('when the deadline passes between runs', () => {
      it('should stop and say how far it got', async () => {
        const { application, check, copy } = benchOf();
        application.coverage.onRun = () => {
          application.clock.advance(HOUR_MS);
        };

        const result = await check.run(copy, RUNNING);

        expect(result.message).toBe('The deadline passed after run 1 of 3.');
        expect([result.retryable, result.runs]).toEqual([true, 1]);
      });
    });
  });
});
