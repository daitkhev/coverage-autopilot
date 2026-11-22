import { describe, expect, it } from 'vitest';

import { StatusLine } from '#components/status-line-pathed';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const PATH = ['Repositories', 'example/payments'];
const FACTS = ['12 files below 80%', 'scanned 2h ago'];

describe('StatusLine', () => {
  it('should join the path with arrows and the facts with dots', () => {
    expect(
      drawnAt(
        <StatusLine path={PATH} facts={FACTS} stale={false} />,
        USUAL_COLUMNS,
      ),
    ).toBe(
      'Repositories › example/payments · 12 files below 80% · scanned 2h ago',
    );
  });

  describe('when the last answer is kept', () => {
    it('should say that it is not fresh, also without colour', () => {
      const drawn = drawnAt(
        drawnWith(
          { colour: false },
          <StatusLine path={PATH} facts={[]} stale />,
        ),
        USUAL_COLUMNS,
      );

      expect(drawn).toBe(
        'Repositories › example/payments  ! not fresh, asking again',
      );
    });
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should join the parts with ASCII', () => {
      expect(
        drawnAt(
          drawnWith(
            { unicode: false },
            <StatusLine path={PATH} facts={['row 1']} stale={false} />,
          ),
          USUAL_COLUMNS,
        ),
      ).toBe('Repositories > example/payments . row 1');
    });
  });

  it.each(WIDTHS)('should fit in %i columns on one line', (columns) => {
    const long = Array.from({ length: 12 }, () => 'example/payments');
    const drawn = drawnAt(
      <StatusLine path={long} facts={FACTS} stale />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
    expect(drawn.split('\n')).toHaveLength(1);
    expect(drawn).toContain('! not fresh, asking again');
  });
});
