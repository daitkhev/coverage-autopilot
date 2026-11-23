import { describe, expect, it } from 'vitest';

import { policyOf } from '#tests/support/verification-requests';
import { InvalidQualityPolicyError } from '#verification/domain/errors/invalid-quality-policy.error';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

describe('QualityPolicy', () => {
  describe('create', () => {
    it('should keep each required check once', () => {
      const policy = QualityPolicy.create(
        policyOf({
          requiredChecks: ['test_files_only', 'type_check', 'test_files_only'],
        }),
      );

      expect(policy.requiredChecks).toEqual(['test_files_only', 'type_check']);
      expect(policy.repeatedRuns).toBe(3);
      expect(policy.mutationThreshold).toBe(50);
    });

    describe('when the check of test files is not required', () => {
      it('should throw InvalidQualityPolicyError', () => {
        expect(() =>
          QualityPolicy.create(policyOf({ requiredChecks: ['type_check'] })),
        ).toThrow(InvalidQualityPolicyError);
      });
    });

    describe('when the number of runs is not a whole number from 1', () => {
      it('should throw InvalidQualityPolicyError', () => {
        expect(() =>
          QualityPolicy.create(policyOf({ repeatedRuns: 0 })),
        ).toThrow(/number of runs/u);
        expect(() =>
          QualityPolicy.create(policyOf({ repeatedRuns: 2.5 })),
        ).toThrow(InvalidQualityPolicyError);
      });
    });

    describe('when the threshold is not a percentage', () => {
      it('should throw InvalidQualityPolicyError', () => {
        for (const mutationThreshold of [-1, 100.5, Number.NaN]) {
          expect(() =>
            QualityPolicy.create(policyOf({ mutationThreshold })),
          ).toThrow(/not a percentage/u);
        }
      });
    });
  });

  describe('requires', () => {
    it('should tell a listed check from one the policy skips', () => {
      const policy = QualityPolicy.create(
        policyOf({ requiredChecks: ['test_files_only', 'coverage_increase'] }),
      );

      expect(policy.requires('coverage_increase')).toBe(true);
      expect(policy.requires('mutation_gain')).toBe(false);
    });
  });
});
