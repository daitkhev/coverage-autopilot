import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import { testRunOf } from '#tests/support/verification-coverage';
import { NEW_TEST_FILE } from '#tests/support/verification-requests';
import { NewTestsCheck } from '#verification/application/commands/verify-patch/checks/new-tests-check';

const RUNNING = new AbortController().signal;

describe('NewTestsCheck', () => {
  it('should always have something to examine', () => {
    expect(
      new NewTestsCheck(verificationApplication().coverage).inapplicability(),
    ).toBeNull();
  });

  describe('run', () => {
    it('should run the test files of the patch alone, without coverage', async () => {
      const application = verificationApplication();
      const { copy } = patchedCopyOf(application);

      const result = await new NewTestsCheck(application.coverage).run(
        copy,
        RUNNING,
      );

      expect(result.status).toBe('passed');
      expect(application.coverage.runs).toEqual([
        {
          ...copy.loan,
          testFiles: [FilePath.create(NEW_TEST_FILE)],
          withCoverage: false,
        },
      ]);
    });

    describe('when a new test fails', () => {
      it('should fail', async () => {
        const application = verificationApplication();
        application.coverage.answers.push(testRunOf('failed'));

        const result = await new NewTestsCheck(application.coverage).run(
          patchedCopyOf(application).copy,
          RUNNING,
        );

        expect(result.message).toBe('The new tests fail.');
      });
    });
  });
});
