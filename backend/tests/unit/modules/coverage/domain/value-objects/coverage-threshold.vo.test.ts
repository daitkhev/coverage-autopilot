import { describe, expect, it } from 'vitest';

import { InvalidCoveragePercentageError } from '#coverage/domain/errors/invalid-coverage-percentage.error';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { countersOf } from '#tests/support/coverage-snapshots';

describe('CoverageThreshold', () => {
  describe('byDefault', () => {
    it('should be 80% of lines', () => {
      const threshold = CoverageThreshold.byDefault();

      expect(threshold.metric).toBe('lines');
      expect(threshold.percentage.value).toBe(80);
    });
  });

  describe('create', () => {
    describe('when the percentage is out of range', () => {
      it('should throw InvalidCoveragePercentageError', () => {
        expect(() =>
          CoverageThreshold.create({ metric: 'branches', percentage: 101 }),
        ).toThrow(InvalidCoveragePercentageError);
      });
    });
  });

  describe('isAbove', () => {
    const threshold = CoverageThreshold.create({
      metric: 'branches',
      percentage: 50,
    });

    it('should read the counter of its own metric', () => {
      expect(
        threshold.isAbove(countersOf({ branches: [1, 4], lines: [9, 9] })),
      ).toBe(true);
      expect(
        threshold.isAbove(countersOf({ branches: [2, 4], lines: [0, 9] })),
      ).toBe(false);
    });

    describe('when the metric has nothing to count', () => {
      it('should not be above the counters', () => {
        expect(threshold.isAbove(countersOf({ lines: [0, 9] }))).toBe(false);
      });
    });
  });
});
