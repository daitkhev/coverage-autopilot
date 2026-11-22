import { describe, expect, it } from 'vitest';

import { type Freshness, StatusLine } from '#components/status-line';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const SECOND_AGO = '2026-11-21T14:04:59.000Z';
const FACTS = ['5 repositories', '1 scan running'];

function draw(freshness: Freshness, columns = USUAL_COLUMNS): string {
  return drawnAt(<StatusLine facts={FACTS} freshness={freshness} />, columns);
}

describe('StatusLine', () => {
  it('should say what the screen shows and how old the answer is', () => {
    expect(
      draw({ answeredAt: SECOND_AGO, stale: false, now: SAMPLE_NOW }),
    ).toBe('5 repositories · 1 scan running · updated 1s ago');
  });

  describe('when the last try failed', () => {
    it('should say that the answer is not fresh', () => {
      expect(
        draw({
          answeredAt: '2026-11-21T14:04:48.000Z',
          stale: true,
          now: SAMPLE_NOW,
        }),
      ).toBe('5 repositories · 1 scan running · ! not fresh, updated 12s ago');
    });
  });

  describe('when no answer came yet', () => {
    it('should say that it asks the service', () => {
      expect(
        draw({ answeredAt: undefined, stale: false, now: SAMPLE_NOW }),
      ).toBe('5 repositories · 1 scan running · ⠋ asking the service');
    });

    it('should say when the service did not answer', () => {
      expect(
        draw({ answeredAt: undefined, stale: true, now: SAMPLE_NOW }),
      ).toBe('5 repositories · 1 scan running · ! no answer yet');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = draw(
      { answeredAt: SECOND_AGO, stale: true, now: SAMPLE_NOW },
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
