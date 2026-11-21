import { describe, expect, it } from 'vitest';

import { InvalidCoverageCounterError } from '#coverage/domain/errors/invalid-coverage-counter.error';
import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import { CoveragePercentage } from '#coverage/domain/value-objects/coverage-percentage.vo';

describe('CoverageCounter', () => {
  describe('create', () => {
    it('should keep the covered and the total count', () => {
      const counter = CoverageCounter.create({ covered: 2, total: 6 });

      expect(counter.covered).toBe(2);
      expect(counter.total).toBe(6);
    });

    describe('when the counts are not counts of covered things', () => {
      it.each([
        [-1, 2],
        [1, -2],
        [1.5, 2],
        [3, 2],
      ])('should throw InvalidCoverageCounterError for %s of %s', (c, t) => {
        expect(() => CoverageCounter.create({ covered: c, total: t })).toThrow(
          new InvalidCoverageCounterError(
            `${String(c)} of ${String(t)} is not a count of covered things: ` +
              'both are whole numbers from 0, and the first is not more.',
          ),
        );
      });
    });
  });

  describe('percentage', () => {
    it('should give the share covered', () => {
      expect(
        CoverageCounter.create({ covered: 1, total: 4 }).percentage(),
      ).toEqual(CoveragePercentage.create(25));
    });

    describe('when there is nothing to count', () => {
      it('should give no percentage instead of 0%', () => {
        const nothing = CoverageCounter.create({ covered: 0, total: 0 });

        expect(nothing.isEmpty()).toBe(true);
        expect(nothing.percentage()).toBeNull();
      });
    });
  });

  describe('isBelow', () => {
    it('should say whether the share covered is under a percentage', () => {
      const half = CoveragePercentage.create(50);

      expect(
        CoverageCounter.create({ covered: 1, total: 3 }).isBelow(half),
      ).toBe(true);
      expect(
        CoverageCounter.create({ covered: 1, total: 2 }).isBelow(half),
      ).toBe(false);
    });

    it('should never put nothing to count below a percentage', () => {
      expect(
        CoverageCounter.create({ covered: 0, total: 0 }).isBelow(
          CoveragePercentage.create(100),
        ),
      ).toBe(false);
    });
  });

  describe('plus', () => {
    it('should add both counts', () => {
      const sum = CoverageCounter.create({ covered: 1, total: 2 }).plus(
        CoverageCounter.create({ covered: 3, total: 5 }),
      );

      expect(sum.equals(CoverageCounter.create({ covered: 4, total: 7 }))).toBe(
        true,
      );
    });
  });

  describe('InvalidCoverageCounterError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidCoverageCounterError('x')).toMatchObject({
        name: 'InvalidCoverageCounterError',
        code: 'invalid_coverage_counter',
        retryable: false,
      });
    });
  });
});
