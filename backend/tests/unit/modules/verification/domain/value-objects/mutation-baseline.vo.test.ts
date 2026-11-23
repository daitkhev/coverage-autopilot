import { describe, expect, it } from 'vitest';

import {
  baselineRun,
  MUTANT_SET,
  mutantAt,
  TOOL,
} from '#tests/support/verification-mutants';
import { mutantOf } from '#verification/application/dto/verification-dto-mapping';
import { InvalidMutationBaselineError } from '#verification/domain/errors/invalid-mutation-baseline.error';
import { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';

const VALID = {
  tool: TOOL,
  totalMutants: 1,
  mutantSetHash: MUTANT_SET,
  undetected: [{ mutant: mutantOf(mutantAt(1)), status: 'survived' as const }],
  cacheReference: null,
};

describe('MutationBaseline', () => {
  describe('fromRun', () => {
    it('should keep the mutants that survived and those no test runs', () => {
      const run = baselineRun();

      const baseline = MutationBaseline.fromRun({
        ...run,
        mutants: run.mutants.map((each) => ({
          mutant: mutantOf(each),
          status: each.status,
        })),
      });

      expect(baseline.totalMutants).toBe(5);
      expect(
        baseline.undetected.map(({ mutant, status }) => [
          mutant.startLine,
          status,
        ]),
      ).toEqual([
        [3, 'survived'],
        [4, 'no_coverage'],
        [5, 'survived'],
      ]);
      expect(baseline.mutantSetHash).toBe(MUTANT_SET);
      expect(baseline.cacheReference).toBe('mutation-cache');
    });
  });

  describe('create', () => {
    describe('when the tool is not named', () => {
      it('should throw InvalidMutationBaselineError', () => {
        expect(() =>
          MutationBaseline.create({ ...VALID, tool: { ...TOOL, version: '' } }),
        ).toThrow(InvalidMutationBaselineError);
      });
    });

    describe('when the set of mutants has no hash', () => {
      it('should throw InvalidMutationBaselineError', () => {
        expect(() =>
          MutationBaseline.create({ ...VALID, mutantSetHash: '' }),
        ).toThrow(/no hash/u);
      });
    });

    describe('when there are fewer mutants than undetected ones', () => {
      it('should throw InvalidMutationBaselineError', () => {
        expect(() =>
          MutationBaseline.create({ ...VALID, totalMutants: 0 }),
        ).toThrow(/cannot hold/u);
      });
    });
  });

  describe('isMeasuredBy', () => {
    it('should hold the tool, its version and its runner alike', () => {
      const baseline = MutationBaseline.create(VALID);

      expect(baseline.isMeasuredBy({ ...TOOL })).toBe(true);
      expect(baseline.isMeasuredBy({ ...TOOL, name: 'other' })).toBe(false);
      expect(baseline.isMeasuredBy({ ...TOOL, version: '10.2.0' })).toBe(false);
      expect(baseline.isMeasuredBy({ ...TOOL, testRunner: 'jest' })).toBe(
        false,
      );
    });
  });
});
