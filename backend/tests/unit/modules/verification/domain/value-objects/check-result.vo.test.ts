import { describe, expect, it } from 'vitest';

import { TEST_FAILURE } from '#tests/support/verification-coverage';
import { InvalidCheckResultError } from '#verification/domain/errors/invalid-check-result.error';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';

describe('CheckResult', () => {
  describe('when a check that did not fail names a failure of a test', () => {
    it.each([
      [
        'passed',
        () =>
          CheckResult.passed('new_tests_pass', { testFailure: TEST_FAILURE }),
      ],
      [
        'error',
        () =>
          CheckResult.error('new_tests_pass', {
            message: 'The new tests ran out of time.',
            retryable: true,
            testFailure: TEST_FAILURE,
          }),
      ],
    ])('should refuse a %s check', (_status, make) => {
      expect(make).toThrow(
        /^The result of the check new_tests_pass cannot be: a \w+ check names a failure of a test\.$/u,
      );
    });
  });

  describe('passed', () => {
    it('should keep its evidence and no reason', () => {
      const result = CheckResult.passed('repeated_runs', {
        runs: 3,
        outputReference: 'test-run',
      });

      expect(result.status).toBe('passed');
      expect(result.runs).toBe(3);
      expect(result.outputReference).toBe('test-run');
      expect(result.message).toBeNull();
      expect(result.retryable).toBe(false);
      expect(result.durationMs).toBeNull();
    });
  });

  describe('passedWith', () => {
    it('should keep its evidence and say what it did not judge', () => {
      const result = CheckResult.passedWith(
        'existing_tests_pass',
        'Left out: 2 that failed before the patch.',
        { outputReference: 'test-run' },
      );

      expect(result.status).toBe('passed');
      expect(result.message).toBe('Left out: 2 that failed before the patch.');
      expect(result.outputReference).toBe('test-run');
    });
  });

  describe('failed', () => {
    it('should keep the sentence for the generator', () => {
      const result = CheckResult.failed(
        'new_tests_pass',
        'The new tests fail.',
      );

      expect(result.status).toBe('failed');
      expect(result.message).toBe('The new tests fail.');
      expect(result.runs).toBeNull();
      expect(result.outputReference).toBeNull();
      expect(result.testFailure).toBeNull();
    });

    it('should keep what the run of the tests said first', () => {
      const result = CheckResult.failed(
        'new_tests_pass',
        'The new tests fail.',
        {
          testFailure: TEST_FAILURE,
        },
      );

      expect(result.testFailure).toEqual(TEST_FAILURE);
    });

    describe('when the sentence is empty', () => {
      it('should throw InvalidCheckResultError', () => {
        expect(() => CheckResult.failed('type_check', '')).toThrow(
          InvalidCheckResultError,
        );
      });
    });
  });

  describe('error', () => {
    it('should say whether running again can help', () => {
      const result = CheckResult.error('mutation_gain', {
        message: 'The mutation tool ran out of time.',
        retryable: true,
      });

      expect(result.status).toBe('error');
      expect(result.retryable).toBe(true);
    });
  });

  describe('notApplicable and skipped', () => {
    it('should give a reason only for a check with nothing to examine', () => {
      const inapplicable = CheckResult.notApplicable(
        'type_check',
        'No compiler.',
      );
      const skipped = CheckResult.skipped('mutation_gain');

      expect(inapplicable.status).toBe('not_applicable');
      expect(inapplicable.message).toBe('No compiler.');
      expect(skipped.status).toBe('skipped');
      expect(skipped.message).toBeNull();
    });
  });

  describe('withDuration', () => {
    it('should keep everything else', () => {
      const result = CheckResult.passed('type_check').withDuration(1500);

      expect(result.durationMs).toBe(1500);
      expect(result.name).toBe('type_check');
    });

    describe('when the time is not a whole number from 0', () => {
      it('should throw InvalidCheckResultError', () => {
        const result = CheckResult.passed('type_check');

        expect(() => result.withDuration(-1)).toThrow(InvalidCheckResultError);
        expect(() => result.withDuration(1.5)).toThrow(InvalidCheckResultError);
      });
    });
  });

  describe('when the runs are not a whole number', () => {
    it('should throw InvalidCheckResultError', () => {
      expect(() => CheckResult.passed('repeated_runs', { runs: 0.5 })).toThrow(
        /runs or its time/u,
      );
    });
  });
});
