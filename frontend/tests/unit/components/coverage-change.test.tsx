import { describe, expect, it } from 'vitest';

import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';

import {
  counterCoverage,
  CounterPercent,
  CoverageChange,
} from '#components/coverage-change';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { BAR_CELLS } from '#theme/widths';

const THRESHOLD = 80;

const BEFORE: CoverageCounter = { covered: 21, total: 51, percentage: 41.2 };
const AFTER: CoverageCounter = { covered: 45, total: 51, percentage: 88.2 };
const NOTHING: CoverageCounter = { covered: 0, total: 0, percentage: null };

function change(
  before: CoverageCounter,
  after: CoverageCounter,
  columns = USUAL_COLUMNS,
): string {
  return drawnAt(
    <CoverageChange
      label="Lines"
      before={before}
      after={after}
      threshold={THRESHOLD}
      cells={BAR_CELLS.list}
    />,
    columns,
  );
}

describe('CoverageChange', () => {
  it('should draw the percentage before and the bar after', () => {
    expect(change(BEFORE, AFTER)).toBe(
      'Lines       41.2% → ━━━━━━━━┼─   88.2%',
    );
  });

  describe('when the counter has nothing to count', () => {
    it('should draw no percentage at all', () => {
      const drawn = change(NOTHING, NOTHING);

      expect(drawn).not.toContain('%');
      expect(drawn).toBe('Lines         0/0 → 0/0  no code');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(change(BEFORE, AFTER, columns))).toBeLessThanOrEqual(
      columns,
    );
  });
});

describe('CounterPercent', () => {
  it('should write a percentage, or covered of the total without one', () => {
    const drawn = (counter: CoverageCounter): string =>
      drawnAt(
        <CounterPercent counter={counter} threshold={THRESHOLD} />,
        USUAL_COLUMNS,
      );

    expect(drawn(BEFORE)).toBe('41.2%');
    expect(drawn(NOTHING)).toBe('0/0');
  });
});

describe('counterCoverage', () => {
  it('should read a counter with nothing to count as no code', () => {
    expect(counterCoverage(NOTHING)).toEqual({ state: 'no_executable_code' });
    expect(counterCoverage(BEFORE)).toEqual({
      state: 'measured',
      percent: 41.2,
    });
  });
});
