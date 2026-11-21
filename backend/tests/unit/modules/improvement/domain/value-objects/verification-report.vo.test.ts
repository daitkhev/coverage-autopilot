import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  CHECK_STATUSES,
  type Verdict,
  VERDICTS,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';
import {
  checkOf,
  hashOf,
  reportPropsOf,
} from '#tests/support/improvement-values';

function refusal(problem: string): InvalidImprovementValueError {
  return new InvalidImprovementValueError(
    `The verification report ${problem}.`,
  );
}

describe('VerificationReport', () => {
  it('should know the verdicts and the statuses of the contract', () => {
    expect(VERDICTS).toEqual(['accepted', 'rejected', 'inconclusive']);
    expect(CHECK_STATUSES).toEqual([
      'passed',
      'failed',
      'skipped',
      'not_applicable',
      'error',
    ]);
  });

  describe('create', () => {
    it('should keep every part of the report as it came', () => {
      const props = reportPropsOf('rejected', 'd');
      const report = VerificationReport.create(props);

      expect({
        patchHash: report.patchHash,
        verdict: report.verdict,
        reasons: report.reasons,
        checks: report.checks,
        coverageBefore: report.coverageBefore,
        coverageAfter: report.coverageAfter,
        mutants: report.mutants,
        survivingMutants: report.survivingMutants,
      }).toEqual(props);
    });

    it.each<Verdict>(['rejected', 'inconclusive'])(
      'should let a %s report hold a check against the patch',
      (verdict) => {
        expect(VerificationReport.create(reportPropsOf(verdict)).verdict).toBe(
          verdict,
        );
      },
    );

    describe('when the patch or the verdict is not named', () => {
      it.each([
        { patchHash: hashOf('A') },
        { patchHash: 'a'.repeat(63) },
        { verdict: 'approved' as Verdict },
      ])('should throw InvalidImprovementValueError for %o', (change) => {
        expect(() =>
          VerificationReport.create({
            ...reportPropsOf('accepted'),
            ...change,
          }),
        ).toThrow(
          refusal('does not name a patch by its hash or has no known verdict'),
        );
      });
    });

    describe('when a check appears twice', () => {
      it('should throw InvalidImprovementValueError', () => {
        const check = checkOf('new_tests_pass', 'accepted');

        expect(() =>
          VerificationReport.create({
            ...reportPropsOf('accepted'),
            checks: [check, check],
          }),
        ).toThrow(refusal('has a check twice'));
      });
    });

    describe('when it accepts a patch a check held back', () => {
      it.each<Verdict>(['rejected', 'inconclusive'])(
        'should throw InvalidImprovementValueError for a check of a %s report',
        (verdict) => {
          expect(() =>
            VerificationReport.create({
              ...reportPropsOf('accepted'),
              checks: [
                checkOf('test_files_only', 'accepted'),
                checkOf('new_tests_pass', verdict),
              ],
            }),
          ).toThrow(
            refusal('accepts a patch that a check failed or could not judge'),
          );
        },
      );
    });
  });
});
