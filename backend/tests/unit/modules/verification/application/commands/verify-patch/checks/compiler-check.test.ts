import { describe, expect, it } from 'vitest';

import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';
import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import {
  baselineOf,
  HOUR_MS,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { VERIFICATION_TEST_SETTINGS } from '#tests/support/verification-stand-ins';
import { CompilerCheck } from '#verification/application/commands/verify-patch/checks/compiler-check';
import type { TypeCheckResult } from '#verification/application/ports/type-checker.port';

const RUNNING = new AbortController().signal;

function benchOf(result?: TypeCheckResult) {
  const application = verificationApplication();
  if (result !== undefined) {
    application.typeChecker.result = result;
  }
  const check = new CompilerCheck(
    application.typeChecker,
    VERIFICATION_TEST_SETTINGS,
  );
  return { application, check, ...patchedCopyOf(application) };
}

describe('CompilerCheck', () => {
  describe('inapplicability', () => {
    it('should have something to examine when the commit type-checks', () => {
      const { check, copy } = benchOf();

      expect(check.inapplicability(copy)).toBeNull();
    });

    it('should say why a commit that does not type-check compares with nothing', () => {
      const { application, check } = benchOf();
      const reasons = (['fails', 'absent'] as const).map((typeCheck) =>
        check.inapplicability(
          patchedCopyOf(application, {
            command: verifyRequestOf({ baseline: baselineOf({ typeCheck }) }),
          }).copy,
        ),
      );

      expect(reasons).toEqual([
        expect.stringContaining('does not type-check without the patch'),
        expect.stringContaining('no tsconfig.json'),
      ]);
    });
  });

  describe('run', () => {
    it('should type-check the copy within the limit of the settings', async () => {
      const { application, check, copy } = benchOf();

      const result = await check.run(copy, RUNNING);

      expect(result.status).toBe('passed');
      expect(result.outputReference).toBe('type-check');
      expect(application.typeChecker.requests).toEqual([
        {
          workingCopyPath: WORKING_COPY_PATH,
          owner: 'improvement:7:attempt:1',
          timeoutMs: VERIFICATION_TEST_SETTINGS.typeCheckTimeoutMs,
        },
      ]);
    });

    it('should give the compiler no more than the time left', async () => {
      const { application, check, copy } = benchOf();
      application.clock.advance(HOUR_MS - 2000);

      await check.run(copy, RUNNING);

      expect(application.typeChecker.requests[0]?.timeoutMs).toBe(2000);
    });

    describe('when the new tests do not type-check', () => {
      it('should fail', async () => {
        const { check, copy } = benchOf({
          outcome: 'fails',
          durationMs: 800,
          outputReference: 'type-check',
        });

        const result = await check.run(copy, RUNNING);

        expect(result.status).toBe('failed');
        expect(result.message).toBe(
          'The project does not type-check with the new test files.',
        );
      });
    });

    describe('when the compiler cannot finish', () => {
      it('should be an error, worth running again only after a time limit', async () => {
        const timedOut = benchOf({
          outcome: 'timed_out',
          durationMs: 300_000,
          outputReference: 'type-check',
        });
        const absent = benchOf({ outcome: 'absent' });

        const late = await timedOut.check.run(timedOut.copy, RUNNING);
        const missing = await absent.check.run(absent.copy, RUNNING);

        expect([late.status, late.retryable]).toEqual(['error', true]);
        expect([missing.status, missing.retryable]).toEqual(['error', false]);
      });
    });
  });
});
