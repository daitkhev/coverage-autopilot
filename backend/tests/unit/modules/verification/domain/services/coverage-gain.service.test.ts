import { describe, expect, it } from 'vitest';

import {
  coverageGainOf,
  type TargetCounters,
} from '#verification/domain/services/coverage-gain.service';

/** Lines and statements as a test names them; branches and functions 1 of 2. */
function countersOf(lines: number, branches = 1): TargetCounters {
  return {
    statements: { covered: lines, total: 10 },
    branches: { covered: branches, total: 2 },
    functions: { covered: 1, total: 2 },
    lines: { covered: lines, total: 10 },
  };
}

describe('coverageGainOf', () => {
  describe('when more of the metric is covered and nothing less', () => {
    it('should be increased', () => {
      expect(
        coverageGainOf({
          before: countersOf(4),
          after: countersOf(6),
          metric: 'lines',
        }),
      ).toEqual({ outcome: 'increased' });
    });
  });

  describe('when only another metric went up', () => {
    it('should be unchanged', () => {
      expect(
        coverageGainOf({
          before: countersOf(4),
          after: countersOf(4, 2),
          metric: 'lines',
        }),
      ).toEqual({ outcome: 'unchanged' });
    });
  });

  describe('when a counter covers less', () => {
    it('should be decreased and name the counter', () => {
      expect(
        coverageGainOf({
          before: countersOf(4, 2),
          after: countersOf(8, 1),
          metric: 'lines',
        }),
      ).toEqual({ outcome: 'decreased', metric: 'branches' });
    });
  });
});
