import { describe, expect, it } from 'vitest';

import { InvalidCoveragePercentageError } from '#coverage/domain/errors/invalid-coverage-percentage.error';
import { CoveragePercentage } from '#coverage/domain/value-objects/coverage-percentage.vo';

describe('CoveragePercentage', () => {
  describe('create', () => {
    it.each([0, 37.5, 100])('should keep %s as it is', (value) => {
      expect(CoveragePercentage.create(value).value).toBe(value);
    });

    describe('when the value is not a share from 0 to 100', () => {
      it.each([-0.1, 100.1, Number.NaN, Number.POSITIVE_INFINITY])(
        'should throw InvalidCoveragePercentageError for %s',
        (value) => {
          expect(() => CoveragePercentage.create(value)).toThrow(
            new InvalidCoveragePercentageError(
              `${String(value)} is not a percentage from 0 to 100.`,
            ),
          );
        },
      );
    });
  });

  describe('ofCounts', () => {
    it('should give the share of covered in total, unrounded', () => {
      expect(CoveragePercentage.ofCounts(1, 3).value).toBeCloseTo(33.333, 3);
      expect(CoveragePercentage.ofCounts(4, 4).value).toBe(100);
    });
  });

  describe('isGreaterThanShare', () => {
    it('should compare without rounding', () => {
      const eighty = CoveragePercentage.create(80);

      expect(eighty.isGreaterThanShare(79, 100)).toBe(true);
      expect(eighty.isGreaterThanShare(4, 5)).toBe(false);
      expect(eighty.isGreaterThanShare(5, 5)).toBe(false);
    });

    it('should never be more than a share of nothing', () => {
      expect(CoveragePercentage.create(100).isGreaterThanShare(0, 0)).toBe(
        false,
      );
    });
  });

  describe('InvalidCoveragePercentageError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidCoveragePercentageError('x')).toMatchObject({
        name: 'InvalidCoveragePercentageError',
        code: 'invalid_coverage_percentage',
        retryable: false,
      });
    });
  });
});
