import { describe, expect, it } from 'vitest';

import { followUpOf } from '#improvement/application/commands/run-improvement/verification-verdict';
import type { CheckName } from '#improvement/domain/value-objects/quality-policy.vo';
import {
  type CheckResult,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';
import {
  checkOf,
  policyOf,
  reportOf,
  reportPropsOf,
} from '#tests/support/improvement-values';

/** A check that could not finish and may on another run. */
function unfinishedOf(name: CheckName): CheckResult {
  return checkOf(name, 'inconclusive');
}

/** A check that could not finish, and another run cannot help. */
function stuckOf(name: CheckName): CheckResult {
  return { ...unfinishedOf(name), retryable: false };
}

function inconclusiveWith(
  checks: readonly CheckResult[],
  reasons: readonly string[] = ['The mutation tool ran out of time.'],
): VerificationReport {
  return VerificationReport.create({
    ...reportPropsOf('inconclusive'),
    reasons,
    checks,
  });
}

describe('followUpOf', () => {
  it.each(['accepted', 'rejected'] as const)(
    'should leave a report that is %s to the aggregate',
    (verdict) => {
      const followUp = followUpOf(reportOf(verdict), policyOf());

      expect(followUp).toEqual({ failure: null, result: { next: 'continue' } });
    },
  );

  describe('when every required check that could not finish may pass', () => {
    it('should verify the same patch again and name those checks', () => {
      const report = inconclusiveWith([
        unfinishedOf('new_tests_pass'),
        unfinishedOf('mutation_gain'),
      ]);

      const followUp = followUpOf(report, policyOf());

      expect(followUp.failure).toBeNull();
      expect(followUp.result).toEqual({
        next: 'retry',
        reason: {
          code: 'verification_inconclusive',
          message:
            'The checks new_tests_pass, mutation_gain of the quality gate ' +
            'could not finish, and running them again may help.',
        },
      });
    });
  });

  describe('when one required check cannot finish on another run', () => {
    it('should fail the improvement with the reasons of the report', () => {
      const report = inconclusiveWith([
        unfinishedOf('new_tests_pass'),
        stuckOf('mutation_gain'),
      ]);

      const followUp = followUpOf(report, policyOf());

      expect(followUp.result).toEqual({ next: 'continue' });
      expect(followUp.failure?.reason).toBe('verification_error');
      expect(followUp.failure?.message).toBe(
        'The quality gate could not decide on the patch. The mutation tool ' +
          'ran out of time.',
      );
    });
  });

  describe('when no required check ended in error', () => {
    it('should fail the improvement, as only an error may pass', () => {
      const report = inconclusiveWith([unfinishedOf('type_check')], []);

      const followUp = followUpOf(report, policyOf());

      expect(followUp.result).toEqual({ next: 'continue' });
      expect(followUp.failure?.message).toBe(
        'The quality gate could not decide on the patch.',
      );
    });
  });
});
