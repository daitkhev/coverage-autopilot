import { describe, expect, it } from 'vitest';

import { CoverageBar } from '#components/coverage-bar';
import { FactRow } from '#components/fact-row';
import { RoleText } from '#components/role-text';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { BAR_CELLS } from '#theme/widths';

describe('FactRow', () => {
  it('should draw the label in its column and the value beside it', () => {
    expect(
      drawnAt(
        <FactRow label="Worker">
          <RoleText>alive</RoleText>
        </FactRow>,
        USUAL_COLUMNS,
      ),
    ).toBe('Worker       alive');
  });

  it('should line the values of two rows up', () => {
    const drawn = drawnAt(
      <>
        <FactRow label="Lines">
          <CoverageBar
            coverage={{ state: 'measured', percent: 71.4 }}
            threshold={80}
            cells={BAR_CELLS.detail}
          />
        </FactRow>
        <FactRow label="Statements">
          <CoverageBar
            coverage={{ state: 'measured', percent: 70.9 }}
            threshold={80}
            cells={BAR_CELLS.detail}
          />
        </FactRow>
      </>,
      USUAL_COLUMNS,
    );

    expect(drawn).toBe(
      [
        'Lines        ━━━━━━━━━━━──┼──   71.4%',
        'Statements   ━━━━━━━━━━━──┼──   70.9%',
      ].join('\n'),
    );
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = drawnAt(
      <FactRow label="Output">
        <RoleText>{'~/.coverage-autopilot/output/'.repeat(5)}</RoleText>
      </FactRow>,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
