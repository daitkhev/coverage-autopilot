import { describe, expect, it } from 'vitest';

import { type Fact, FactLine } from '#components/fact-line';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const FACTS: readonly Fact[] = [
  { text: 'main' },
  { text: '4f2a9c1' },
  {
    text: 'outdated: main moved since the scan',
    role: 'warning',
    glyph: { name: 'attention', role: 'warning' },
  },
];

describe('FactLine', () => {
  it('should join the facts with a dot', () => {
    expect(drawnAt(<FactLine facts={FACTS} />, USUAL_COLUMNS)).toBe(
      'main · 4f2a9c1 · ! outdated: main moved since the scan',
    );
  });

  it('should draw one fact alone', () => {
    expect(
      drawnAt(<FactLine facts={[{ text: 'main' }]} />, USUAL_COLUMNS),
    ).toBe('main');
  });

  it('should cut a line too long for its room at its end', () => {
    const drawn = drawnAt(<FactLine facts={FACTS} />, 20);

    expect(drawn.split('\n')).toHaveLength(1);
    expect(widestLine(drawn)).toBeLessThanOrEqual(20);
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should join the facts with the ASCII dot', () => {
      expect(
        drawnAt(
          drawnWith({ unicode: false }, <FactLine facts={FACTS} />),
          USUAL_COLUMNS,
        ),
      ).toBe('main . 4f2a9c1 . ! outdated: main moved since the scan');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(
      widestLine(drawnAt(<FactLine facts={FACTS} />, columns)),
    ).toBeLessThanOrEqual(columns);
  });
});
