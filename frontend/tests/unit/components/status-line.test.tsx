import { describe, expect, it } from 'vitest';

import { type Freshness, StatusLine } from '#components/status-line';
import { SAMPLE_NOW, SECOND_AGO } from '#tests/support/fake-service-api';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const PATH = ['Repositories', 'example/payments'];
const FACTS = ['5 repositories', '1 scan running'];
const FRESH: Freshness = {
  answeredAt: SECOND_AGO,
  stale: false,
  now: SAMPLE_NOW,
};
const KEPT: Freshness = { ...FRESH, stale: true };

function draw(freshness: Freshness, columns = USUAL_COLUMNS): string {
  return drawnAt(
    <StatusLine path={PATH} facts={FACTS} freshness={freshness} />,
    columns,
  );
}

describe('StatusLine', () => {
  it('should say the path, what the screen shows and how old the answer is', () => {
    expect(draw(FRESH)).toBe(
      'Repositories › example/payments · 5 repositories · 1 scan running · updated 1s ago',
    );
  });

  describe('when the last try failed', () => {
    it('should say that the answer is not fresh', () => {
      expect(draw({ ...KEPT, answeredAt: '2026-11-21T14:04:48.000Z' })).toBe(
        'Repositories › example/payments · 5 repositories · 1 scan running · ! not fresh, updated 12s ago',
      );
    });

    it('should say it without colour too', () => {
      const drawn = drawnAt(
        drawnWith(
          { colour: false },
          <StatusLine path={PATH} facts={[]} freshness={KEPT} />,
        ),
        USUAL_COLUMNS,
      );

      expect(drawn).toBe(
        'Repositories › example/payments · ! not fresh, updated 1s ago',
      );
    });
  });

  describe('when no answer came yet', () => {
    it('should say that it asks the service', () => {
      expect(draw({ ...FRESH, answeredAt: undefined })).toBe(
        'Repositories › example/payments · 5 repositories · 1 scan running · ⠋ asking the service',
      );
    });

    it('should say when the service did not answer', () => {
      expect(draw({ ...KEPT, answeredAt: undefined })).toBe(
        'Repositories › example/payments · 5 repositories · 1 scan running · ! no answer yet',
      );
    });
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should join the parts with ASCII', () => {
      expect(
        drawnAt(
          drawnWith(
            { unicode: false },
            <StatusLine path={PATH} facts={['row 1']} freshness={FRESH} />,
          ),
          USUAL_COLUMNS,
        ),
      ).toBe('Repositories > example/payments . row 1 . updated 1s ago');
    });
  });

  it.each(WIDTHS)(
    'should fit in %i columns on one line, cut before the freshness',
    (columns) => {
      const long = Array.from({ length: 12 }, () => 'example/payments');
      const drawn = drawnAt(
        <StatusLine path={long} facts={FACTS} freshness={KEPT} />,
        columns,
      );

      expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
      expect(drawn.split('\n')).toHaveLength(1);
      expect(drawn).toContain('! not fresh, updated 1s ago');
    },
  );
});
