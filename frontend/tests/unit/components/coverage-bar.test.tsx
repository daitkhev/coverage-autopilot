import { describe, expect, it } from 'vitest';

import { type Coverage, CoverageBar } from '#components/coverage-bar';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { BAR_CELLS } from '#theme/widths';

const THRESHOLD = 80;

function draw(coverage: Coverage, columns = USUAL_COLUMNS): string {
  return drawnAt(
    <CoverageBar
      coverage={coverage}
      threshold={THRESHOLD}
      cells={BAR_CELLS.list}
    />,
    columns,
  );
}

describe('CoverageBar', () => {
  it('should draw a bar with its threshold tick and its percentage', () => {
    expect(draw({ state: 'measured', percent: 41.2 })).toMatchSnapshot();
  });

  it('should draw a bar above the threshold past its tick', () => {
    expect(draw({ state: 'measured', percent: 95 })).toBe('━━━━━━━━┼━   95.0%');
  });

  it('should draw an empty bar for a file at 0%', () => {
    expect(draw({ state: 'measured', percent: 0 })).toBe('────────┼─    0.0%');
  });

  describe('when the file could not be measured', () => {
    it('should never draw a percentage', () => {
      const drawn = draw({
        state: 'unmeasured',
        reason: 'has a syntax error',
      });

      expect(drawn).not.toMatch(/%/u);
      expect(drawn).not.toMatch(/━|─/u);
      expect(drawn).toBe('N/A  has a syntax error');
    });
  });

  describe('when the file has no executable code', () => {
    it('should draw 0/0 and say there is no code', () => {
      const drawn = draw({ state: 'no_executable_code' });

      expect(drawn).not.toMatch(/%/u);
      expect(drawn).toBe('0/0  no code');
    });
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should draw the bar in ASCII', () => {
      expect(
        drawnAt(
          drawnWith(
            { unicode: false },
            <CoverageBar
              coverage={{ state: 'measured', percent: 50 }}
              threshold={THRESHOLD}
              cells={BAR_CELLS.list}
            />,
          ),
          USUAL_COLUMNS,
        ),
      ).toBe('=====---|-   50.0%');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = draw({ state: 'measured', percent: 100 }, columns);

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
