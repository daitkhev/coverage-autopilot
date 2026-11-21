import { describe, expect, it } from 'vitest';

import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import { testRunOf } from '#tests/support/verification-coverage';
import {
  baselineOf,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { ExistingTestsCheck } from '#verification/application/commands/verify-patch/checks/existing-tests-check';

const RUNNING = new AbortController().signal;

describe('ExistingTestsCheck', () => {
  const check = new ExistingTestsCheck();

  describe('inapplicability', () => {
    it('should compare only with a commit whose tests passed', () => {
      const application = verificationApplication();
      const reasonFor = (
        existingTests: 'passed' | 'failed' | 'timed_out',
      ): string | null =>
        check.inapplicability(
          patchedCopyOf(application, {
            command: verifyRequestOf({
              baseline: baselineOf({ existingTests }),
            }),
          }).copy,
        );

      expect(reasonFor('passed')).toBeNull();
      expect(reasonFor('failed')).toContain('Some tests of the commit failed');
      expect(reasonFor('timed_out')).toContain(
        'ran out of time before the patch',
      );
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
});
