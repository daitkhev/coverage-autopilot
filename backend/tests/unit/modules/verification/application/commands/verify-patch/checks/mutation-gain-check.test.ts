import { describe, expect, it } from 'vitest';

import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import { testRunOf } from '#tests/support/verification-coverage';
import {
  completedRunOf,
  killedByNewTest,
  mutantAt,
  mutantResultOf,
} from '#tests/support/verification-mutants';
import {
  NEW_TEST_FILE,
  TARGET_FILE,
} from '#tests/support/verification-requests';
import { VERIFICATION_TEST_SETTINGS } from '#tests/support/verification-stand-ins';
import { MutationGainCheck } from '#verification/application/commands/verify-patch/checks/mutation-gain-check';
import type { MutationRunResult } from '#verification/application/ports/mutation-runner.port';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';

const RUNNING = new AbortController().signal;

function benchOf(patched?: MutationRunResult) {
  const application = verificationApplication();
  if (patched !== undefined) {
    application.mutationRunner.patched = patched;
  }
  const check = new MutationGainCheck(
    application.mutationRunner,
    VERIFICATION_TEST_SETTINGS,
  );
  return { application, check, ...patchedCopyOf(application) };
}

describe('MutationGainCheck', () => {
  describe('inapplicability', () => {
    it('should run the tool only when every test passes with the patch', async () => {
      const passing = benchOf();
      const failingCheck = benchOf();
      failingCheck.copy.book.record(
        CheckResult.failed('existing_tests_pass', 'They fail.'),
      );
      const failingRun = benchOf();
      failingRun.application.coverage.answers.push(testRunOf('failed'));
      await failingRun.copy.fullRun.result(RUNNING);

      expect(passing.check.inapplicability(passing.copy)).toBeNull();
      expect(failingCheck.check.inapplicability(failingCheck.copy)).toBe(
        'Some tests fail with the patch, so the mutation tool cannot run.',
      );
      expect(failingRun.check.inapplicability(failingRun.copy)).not.toBeNull();
    });
  });

  describe('run', () => {
    it('should measure the patched copy from the cache of the baseline', async () => {
      const { application, check, copy } = benchOf();

      const result = await check.run(copy, RUNNING);

      expect(result.status).toBe('passed');
      expect(result.outputReference).toBe('mutation-output');
      expect(application.mutationRunner.requests).toEqual([
        {
          ...copy.loan,
          targetFile: copy.command.targetFile,
          testRunner: 'vitest',
          timeoutMs: VERIFICATION_TEST_SETTINGS.mutationRunTimeoutMs,
          baselineCacheReference: 'mutation-cache',
        },
      ]);
      expect(copy.evidence.mutation).toEqual({
        counts: { undetectedBefore: 3, killed: 3, reached: 3, timedOut: 0 },
        surviving: [],
      });
    });

    describe('when the new tests kill too few of the mutants', () => {
      it('should fail with the numbers and name the survivors', async () => {
        const none = benchOf(
          completedRunOf(
            [3, 4, 5].map((line) =>
              mutantResultOf({ line, status: 'survived' }),
            ),
          ),
        );
        const few = benchOf(
          completedRunOf([
            killedByNewTest(3),
            mutantResultOf({
              line: 4,
              status: 'survived',
              coveredBy: [NEW_TEST_FILE],
            }),
            mutantResultOf({
              line: 5,
              status: 'survived',
              coveredBy: [NEW_TEST_FILE],
            }),
          ]),
        );

        const killedNone = await none.check.run(none.copy, RUNNING);
        const killedFew = await few.check.run(few.copy, RUNNING);

        expect(killedNone.message).toBe(
          `The new tests kill none of the 3 mutants of ${TARGET_FILE} that no test detected.`,
        );
        expect(killedFew.message).toBe(
          'The new tests kill 1 of the 3 undetected mutants they reach, 33%, below the threshold of 50%.',
        );
        expect(few.copy.evidence.mutation?.surviving).toEqual([
          { ...mutantAt(4), reached: true },
          { ...mutantAt(5), reached: true },
        ]);
      });
    });

    describe('when the tool or its set of mutants changed', () => {
      it('should be an error that running again does not help', async () => {
        const { check, copy } = benchOf(
          completedRunOf([3, 4, 5].map(killedByNewTest), {
            mutantSetHash: 'other',
          }),
        );

        const result = await check.run(copy, RUNNING);

        expect([result.status, result.retryable]).toEqual(['error', false]);
        expect(copy.evidence.mutation).toBeNull();
      });
    });

    describe('when the tool cannot finish', () => {
      it('should be an error, worth running again only after a time limit', async () => {
        const unsupported = benchOf({
          outcome: 'unsupported',
          detail: 'The tests fail before any mutant.',
          outputReference: null,
        });
        const late = benchOf({
          outcome: 'timed_out',
          cacheReference: null,
          outputReference: 'mutation-output',
        });

        const refused = await unsupported.check.run(unsupported.copy, RUNNING);
        const timedOut = await late.check.run(late.copy, RUNNING);

        expect(refused.message).toBe(
          'The mutation tool cannot run on the project: The tests fail before any mutant.',
        );
        expect(refused.retryable).toBe(false);
        expect([timedOut.retryable, timedOut.outputReference]).toEqual([
          true,
          'mutation-output',
        ]);
      });
    });

    describe('when the baseline holds no measure of the mutants', () => {
      it('should be an error and run no tool', async () => {
        const application = verificationApplication();
        const check = new MutationGainCheck(
          application.mutationRunner,
          VERIFICATION_TEST_SETTINGS,
        );

        const result = await check.run(
          patchedCopyOf(application, { mutationBaseline: null }).copy,
          RUNNING,
        );

        expect([result.status, result.retryable]).toEqual(['error', false]);
        expect(application.mutationRunner.requests).toEqual([]);
      });
    });

    describe('when the tool could not be installed in the copy', () => {
      it('should be an error that running again does not help', async () => {
        const application = verificationApplication();
        const check = new MutationGainCheck(
          application.mutationRunner,
          VERIFICATION_TEST_SETTINGS,
        );
        const { copy } = patchedCopyOf(application, {
          mutationTool: {
            outcome: 'unsupported',
            detail: 'Stryker does not support Vitest 2.',
            outputReference: 'mutation-install',
          },
        });

        const result = await check.run(copy, RUNNING);

        expect(result).toMatchObject({
          status: 'error',
          retryable: false,
          message:
            'The mutation tool cannot be installed in the project: Stryker does not support Vitest 2.',
          outputReference: 'mutation-install',
        });
        expect(application.mutationRunner.requests).toEqual([]);
      });
    });
  });
});
