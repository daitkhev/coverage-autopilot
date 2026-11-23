import { describe, expect, it } from 'vitest';

import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { countersOf } from '#tests/support/coverage-snapshots';

describe('CoverageCounters', () => {
  describe('of', () => {
    it('should give the counter of each metric', () => {
      const counters = countersOf({
        statements: [1, 2],
        branches: [3, 4],
        functions: [5, 6],
        lines: [7, 8],
      });

      expect(counters.of('statements').covered).toBe(1);
      expect(counters.of('branches').covered).toBe(3);
      expect(counters.of('functions').covered).toBe(5);
      expect(counters.of('lines').covered).toBe(7);
    });
  });

  describe('isEmpty', () => {
    it('should hold for a row of zero of zero only', () => {
      expect(CoverageCounters.none().isEmpty()).toBe(true);
      expect(countersOf({ functions: [0, 1] }).isEmpty()).toBe(false);
    });
  });

  describe('plus', () => {
    it('should add every metric on its own', () => {
      const sum = countersOf({ statements: [1, 2], lines: [1, 1] }).plus(
        countersOf({ branches: [0, 2], lines: [2, 3] }),
      );

      expect(
        sum.equals(
          countersOf({
            statements: [1, 2],
            branches: [0, 2],
            lines: [3, 4],
          }),
        ),
      ).toBe(true);
      expect(sum.of('functions')).toEqual(
        CoverageCounter.create({ covered: 0, total: 0 }),
      );
    });
  });
});
