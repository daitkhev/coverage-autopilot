import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  CHECK_NAMES,
  type CheckName,
  QualityPolicy,
  type QualityPolicyProps,
} from '#improvement/domain/value-objects/quality-policy.vo';

const POLICY: QualityPolicyProps = {
  requiredChecks: CHECK_NAMES,
  repeatedRuns: 3,
  mutationThreshold: 60,
};

describe('QualityPolicy', () => {
  describe('create', () => {
    it('should keep the checks, the runs and the threshold', () => {
      const policy = QualityPolicy.create(POLICY);

      expect(policy.requiredChecks).toEqual(CHECK_NAMES);
      expect(policy.repeatedRuns).toBe(3);
      expect(policy.mutationThreshold).toBe(60);
    });

    it('should not change when the list it was given changes', () => {
      const checks: CheckName[] = ['type_check'];
      const policy = QualityPolicy.create({
        ...POLICY,
        requiredChecks: checks,
      });

      checks.push('mutation_gain');

      expect(policy.requiredChecks).toEqual(['type_check']);
    });

    it('should allow a policy that turns the mutation check off', () => {
      const checks = CHECK_NAMES.filter((check) => check !== 'mutation_gain');

      expect(
        QualityPolicy.create({ ...POLICY, requiredChecks: checks })
          .requiredChecks,
      ).not.toContain('mutation_gain');
    });

    describe('when it breaks a rule of the gate', () => {
      it.each([
        [
          'names a check twice',
          { requiredChecks: ['type_check', 'type_check'] },
        ],
        [
          'names a check the gate does not have',
          { requiredChecks: ['lint'] as unknown as CheckName[] },
        ],
        ['repeats the runs less than once', { repeatedRuns: 0 }],
        ['repeats the runs less than once', { repeatedRuns: 1.5 }],
        ['has a threshold that is not a percentage', { mutationThreshold: -1 }],
        [
          'has a threshold that is not a percentage',
          { mutationThreshold: 101 },
        ],
      ] as const)('should say that it %s', (problem, change) => {
        expect(() => QualityPolicy.create({ ...POLICY, ...change })).toThrow(
          new InvalidImprovementValueError(`The quality policy ${problem}.`),
        );
      });
    });
  });

  describe('requested', () => {
    it('should keep a policy that requires test_files_only', () => {
      const policy = QualityPolicy.requested(POLICY);

      expect(policy.requiredChecks).toEqual(CHECK_NAMES);
      expect(policy.isUsable).toBe(true);
    });

    it('should refuse a policy without test_files_only, which the gate refuses', () => {
      expect(() =>
        QualityPolicy.requested({ ...POLICY, requiredChecks: ['type_check'] }),
      ).toThrow(
        new InvalidImprovementValueError(
          'The quality policy does not require test_files_only, without ' +
            'which the gate applies no patch.',
        ),
      );
    });

    it('should refuse what create refuses', () => {
      expect(() =>
        QualityPolicy.requested({ ...POLICY, repeatedRuns: 0 }),
      ).toThrow(InvalidImprovementValueError);
    });
  });

  describe('isUsable', () => {
    it('should say that a stored policy without test_files_only cannot be judged by', () => {
      const stored = QualityPolicy.create({
        ...POLICY,
        requiredChecks: ['type_check'],
      });

      expect(stored.isUsable).toBe(false);
    });
  });
});
