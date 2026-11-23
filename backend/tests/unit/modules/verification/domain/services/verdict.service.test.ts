import { describe, expect, it } from 'vitest';

import { policyOf, policyWithout } from '#tests/support/verification-requests';
import { verdictOf } from '#verification/domain/services/verdict.service';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

const POLICY = QualityPolicy.create(policyWithout('mutation_gain'));

/** Every check passed, but the ones a test replaces. */
function checksWith(...results: CheckResult[]): CheckResult[] {
  const names: CheckName[] = [
    'test_files_only',
    'type_check',
    'new_tests_pass',
    'existing_tests_pass',
    'repeated_runs',
    'coverage_increase',
  ];
  return [
    ...names.map(
      (name) =>
        results.find((result) => result.name === name) ??
        CheckResult.passed(name),
    ),
    CheckResult.skipped('mutation_gain'),
  ];
}

describe('verdictOf', () => {
  describe('when every required check passed', () => {
    it('should accept with no reason', () => {
      const verdict = verdictOf({ checks: checksWith(), policy: POLICY });

      expect(verdict.value).toBe('accepted');
      expect(verdict.reasons).toEqual([]);
    });
  });

  describe('when a required check has nothing to examine', () => {
    it('should still accept', () => {
      const checks = checksWith(
        CheckResult.notApplicable('type_check', 'No compiler.'),
      );

      expect(verdictOf({ checks, policy: POLICY }).value).toBe('accepted');
    });
  });

  describe('when a required check failed', () => {
    it('should reject with its sentence', () => {
      const checks = checksWith(
        CheckResult.failed('new_tests_pass', 'The new tests fail.'),
        CheckResult.failed('coverage_increase', 'No more lines.'),
      );

      const verdict = verdictOf({ checks, policy: POLICY });

      expect(verdict.value).toBe('rejected');
      expect(verdict.reasons).toEqual([
        'The new tests fail.',
        'No more lines.',
      ]);
    });
  });

  describe('when a required check could not finish', () => {
    it('should be inconclusive, even with a failure', () => {
      const checks = checksWith(
        CheckResult.failed('new_tests_pass', 'The new tests fail.'),
        CheckResult.error('type_check', {
          message: 'Out of time.',
          retryable: true,
        }),
      );

      const verdict = verdictOf({ checks, policy: POLICY });

      expect(verdict.value).toBe('inconclusive');
      expect(verdict.reasons).toEqual(['Out of time.', 'The new tests fail.']);
    });
  });

  describe('when a check the policy does not require failed', () => {
    it('should not count it', () => {
      const policy = QualityPolicy.create(
        policyOf({ requiredChecks: ['test_files_only'] }),
      );
      const checks = [
        CheckResult.passed('test_files_only'),
        CheckResult.failed('coverage_increase', 'No more lines.'),
      ];

      expect(verdictOf({ checks, policy }).value).toBe('accepted');
    });
  });

  describe('when a required check is missing or was skipped', () => {
    it('should be inconclusive and name it', () => {
      const checks = [
        CheckResult.passed('test_files_only'),
        CheckResult.skipped('type_check'),
      ];
      const policy = QualityPolicy.create(
        policyOf({ requiredChecks: ['test_files_only', 'type_check'] }),
      );

      const verdict = verdictOf({ checks, policy });

      expect(verdict.value).toBe('inconclusive');
      expect(verdict.reasons).toEqual([
        'The required check type_check did not run.',
      ]);
    });
  });
});
