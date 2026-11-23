import { describe, expect, it } from 'vitest';

import { TEST_FAILURE } from '#tests/support/verification-coverage';
import {
  killedByNewTest,
  mutantAt,
  mutationBaselineDto,
} from '#tests/support/verification-mutants';
import {
  checkResultDtoOf,
  mutantOf,
  mutationBaselineDtoOf,
  mutationBaselineOf,
  survivingMutantDtoOf,
} from '#verification/application/dto/verification-dto-mapping';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';

describe('verification DTO mapping', () => {
  describe('mutantOf', () => {
    it('should leave out what only the tool knows', () => {
      const mutant = mutantOf(killedByNewTest(9));

      expect(mutant.equals(mutantOf(mutantAt(9)))).toBe(true);
    });
  });

  describe('mutationBaselineDtoOf', () => {
    it('should give back the DTO the baseline was made of', () => {
      const dto = mutationBaselineDto();

      expect(mutationBaselineDtoOf(mutationBaselineOf(dto))).toEqual(dto);
    });
  });

  describe('survivingMutantDtoOf', () => {
    it('should say whether a new test reaches the mutant', () => {
      expect(
        survivingMutantDtoOf({ mutant: mutantOf(mutantAt(4)), reached: true }),
      ).toEqual({ ...mutantAt(4), reached: true });
    });
  });

  describe('checkResultDtoOf', () => {
    it('should carry every field of the result', () => {
      const result = CheckResult.error('repeated_runs', {
        message: 'The new tests ran out of time on run 2 of 3.',
        retryable: true,
        runs: 2,
        outputReference: 'test-run',
      }).withDuration(4000);

      expect(checkResultDtoOf(result)).toEqual({
        name: 'repeated_runs',
        status: 'error',
        retryable: true,
        durationMs: 4000,
        runs: 2,
        message: 'The new tests ran out of time on run 2 of 3.',
        outputReference: 'test-run',
        testFailure: null,
      });
    });

    it('should carry what the run of a failed check said first', () => {
      const result = CheckResult.failed('new_tests_pass', 'They fail.', {
        testFailure: TEST_FAILURE,
      });

      expect(checkResultDtoOf(result).testFailure).toEqual(TEST_FAILURE);
    });
  });
});
