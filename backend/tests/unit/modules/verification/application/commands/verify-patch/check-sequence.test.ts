import { describe, expect, it } from 'vitest';

import {
  patchedCopyOf,
  verificationApplication,
} from '#tests/support/verification-application';
import {
  baselineOf,
  HOUR_MS,
  policyWithout,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

const RUNNING = new AbortController().signal;

describe('CheckSequence', () => {
  describe('run', () => {
    it('should run the second to the seventh check in order and time each', async () => {
      const application = verificationApplication();
      const { copy, heard } = patchedCopyOf(application);
      application.coverage.onRun = () => {
        application.clock.advance(1000);
      };

      await application.sequence.run(copy, RUNNING);

      expect(
        copy.book.checks.map(({ name, status }) => [name, status]),
      ).toEqual([
        ['type_check', 'passed'],
        ['new_tests_pass', 'passed'],
        ['existing_tests_pass', 'passed'],
        ['repeated_runs', 'passed'],
        ['coverage_increase', 'passed'],
        ['mutation_gain', 'passed'],
      ]);
      expect(copy.book.checks.map(({ durationMs }) => durationMs)).toEqual([
        0, 1000, 1000, 3000, 0, 0,
      ]);
      expect(heard.slice(0, 2)).toEqual([
        { check: 'type_check', status: 'running' },
        { check: 'type_check', status: 'passed' },
      ]);
    });

    it('should skip a check the policy does not require', async () => {
      const application = verificationApplication();
      const { copy } = patchedCopyOf(application, {
        policy: QualityPolicy.create(
          policyWithout('type_check', 'repeated_runs'),
        ),
      });

      await application.sequence.run(copy, RUNNING);

      expect(copy.book.statusOf('type_check')).toBe('skipped');
      expect(copy.book.statusOf('repeated_runs')).toBe('skipped');
      expect(application.typeChecker.requests).toEqual([]);
      expect(application.coverage.runs).toHaveLength(2);
    });

    it('should not run a check that has nothing to examine', async () => {
      const application = verificationApplication();
      const { copy } = patchedCopyOf(application, {
        command: verifyRequestOf({
          baseline: baselineOf({ typeCheck: 'fails' }),
        }),
      });

      await application.sequence.run(copy, RUNNING);

      expect(copy.book.checks[0]?.status).toBe('not_applicable');
      expect(copy.book.checks[0]?.durationMs).toBeNull();
      expect(application.typeChecker.requests).toEqual([]);
    });

    it('should start no check after the deadline', async () => {
      const application = verificationApplication();
      const { copy } = patchedCopyOf(application);
      application.clock.advance(HOUR_MS);

      await application.sequence.run(copy, RUNNING);

      expect(copy.book.checks.map(({ status }) => status)).toEqual([
        'error',
        'error',
        'error',
        'not_applicable',
        'error',
        'not_applicable',
      ]);
      expect(copy.book.checks[0]?.message).toBe(
        'The deadline passed before the check started.',
      );
      expect(application.coverage.runs).toEqual([]);
    });

    describe('when the signal is aborted', () => {
      it('should throw before the next check', async () => {
        const application = verificationApplication();
        const { copy } = patchedCopyOf(application);
        const controller = new AbortController();
        controller.abort();

        await expect(
          application.sequence.run(copy, controller.signal),
        ).rejects.toThrow();
        expect(copy.book.checks).toEqual([]);
      });
    });
  });

  describe('notRun', () => {
    it('should give each required check the result it is given', () => {
      const { sequence } = verificationApplication();
      const book = new CheckBook(() => undefined);

      sequence.notRun({
        book,
        policy: QualityPolicy.create(policyWithout('mutation_gain')),
        resultOf: (name) => CheckResult.notApplicable(name, 'Not applied.'),
      });

      expect(book.checks.map(({ status }) => status)).toEqual([
        'not_applicable',
        'not_applicable',
        'not_applicable',
        'not_applicable',
        'not_applicable',
        'skipped',
      ]);
    });
  });
});
