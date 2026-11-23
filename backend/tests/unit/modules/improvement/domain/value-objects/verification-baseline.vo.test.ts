import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { MISSED_STATUSES } from '#improvement/domain/value-objects/mutant.vo';
import {
  TEST_RUN_STATES,
  TYPE_CHECK_STATES,
} from '#improvement/domain/value-objects/verification-baseline.vo';
import {
  BASE_COMMIT,
  baselineOf,
  FAILING_TESTS,
  mutationOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';

describe('VerificationBaseline', () => {
  it('should know the states of the contract of the gate', () => {
    expect(TYPE_CHECK_STATES).toEqual(['passes', 'fails', 'absent']);
    expect(TEST_RUN_STATES).toEqual(['passed', 'failed', 'timed_out']);
    expect(MISSED_STATUSES).toEqual(['survived', 'no_coverage']);
  });

  describe('create', () => {
    it('should keep what the gate measured, as it came', () => {
      const baseline = baselineOf();

      expect(baseline.commit.value).toBe(BASE_COMMIT);
      expect(baseline.targetFile.value).toBe(TARGET_FILE);
      expect([baseline.typeCheck, baseline.existingTests]).toEqual([
        'passes',
        'passed',
      ]);
      expect(baseline.mutation).toEqual(mutationOf());
    });

    it('should keep a baseline with no mutants, as a policy without them has', () => {
      expect(baselineOf({ mutation: null }).mutation).toBeNull();
    });

    it('should keep the tests that failed before any patch', () => {
      const baseline = baselineOf({
        existingTests: 'failed',
        failingTests: FAILING_TESTS,
      });

      expect(baseline.failingTests).toEqual(FAILING_TESTS);
    });

    it('should keep a run that timed out, whose failing tests are not known', () => {
      const baseline = baselineOf({
        existingTests: 'timed_out',
        failingTests: null,
      });

      expect(baseline.failingTests).toBeNull();
    });

    describe('when its tests passed and it names failing tests, or none it knows', () => {
      it.each([[FAILING_TESTS], [null]])(
        'should throw InvalidImprovementValueError for %j',
        (failingTests) => {
          expect(() => baselineOf({ failingTests })).toThrow(
            new InvalidImprovementValueError(
              'A baseline whose tests passed names no failing test, and ' +
                'knows it.',
            ),
          );
        },
      );
    });

    describe('when it lists more undetected mutants than it counts', () => {
      it.each([0, 1.5])(
        'should throw InvalidImprovementValueError for a total of %s',
        (totalMutants) => {
          expect(() =>
            baselineOf({ mutation: { ...mutationOf(), totalMutants } }),
          ).toThrow(
            new InvalidImprovementValueError(
              'A mutation baseline counts at least the mutants it lists as ' +
                'undetected.',
            ),
          );
        },
      );
    });
  });
});
