import { describe, expect, it } from 'vitest';

import { ProgressMeter } from '#components/progress-meter';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { BAR_CELLS } from '#theme/widths';

describe('ProgressMeter', () => {
  it('should draw a limit in use with its numbers', () => {
    expect(
      drawnAt(
        <ProgressMeter
          kind="limit"
          used={84}
          total={200}
          usedText="84k"
          totalText="200k"
          cells={BAR_CELLS.detail}
        />,
        USUAL_COLUMNS,
      ),
    ).toMatchSnapshot();
  });

  it('should draw a run of steps as "3 of 4"', () => {
    expect(
      drawnAt(
        <ProgressMeter kind="steps" used={3} total={4} cells={8} />,
        USUAL_COLUMNS,
      ),
    ).toBe('━━━━━━──  3 of 4');
  });

  it('should fill the whole bar when a limit is spent', () => {
    expect(
      drawnAt(
        <ProgressMeter kind="limit" used={3} total={3} cells={6} />,
        USUAL_COLUMNS,
      ),
    ).toBe('━━━━━━  3 of 3');
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = drawnAt(
      <ProgressMeter
        kind="limit"
        used={28}
        total={30}
        totalText="30 min"
        cells={BAR_CELLS.detail}
      />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
