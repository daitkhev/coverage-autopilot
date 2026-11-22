import { describe, expect, it } from 'vitest';

import { hintsOf, type KeyHint, KeyHints } from '#components/key-hints';
import {
  drawnAt,
  drawnWith,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const FOOTER: readonly KeyHint[] = [
  { key: 'up-down', label: 'move' },
  { key: 'enter', label: 'open' },
  { key: 's', label: 'scan' },
  { key: 'a', label: 'add' },
  { key: '/', label: 'filter' },
  { key: ':', label: 'commands' },
  { key: 'q', label: 'quit' },
];

function nothing(): void {
  // The hints of an action do not run it.
}

describe('hintsOf', () => {
  it('should name the actions that have words, as the footer writes their keys', () => {
    expect(
      hintsOf([
        { key: 'up', run: nothing, hint: { key: 'up-down', label: 'move' } },
        { key: 'down', run: nothing },
        { key: 'c', run: nothing, hint: { label: 'cancel', role: 'danger' } },
        { run: nothing, hint: { label: 'a step without a key' } },
      ]),
    ).toEqual([
      { key: 'up-down', label: 'move' },
      { key: 'c', label: 'cancel', role: 'danger' },
    ]);
  });
});

describe('KeyHints', () => {
  it('should draw the keys of the footer', () => {
    expect(
      drawnAt(<KeyHints hints={FOOTER} />, USUAL_COLUMNS),
    ).toMatchSnapshot();
  });

  it('should join the keys of a dialog with a dot', () => {
    const hints: readonly KeyHint[] = [
      { key: 'up-down', label: 'choose' },
      { key: 'enter', label: 'confirm' },
      { key: 'esc', label: 'keep' },
    ];

    expect(drawnAt(<KeyHints hints={hints} joined />, USUAL_COLUMNS)).toBe(
      '↑↓ choose · enter confirm · esc keep',
    );
  });

  it('should draw an inactive action with the reason beside it', () => {
    const hints: readonly KeyHint[] = [
      { key: 'enter', label: 'improve', inactive: 'after a scan' },
    ];

    expect(drawnAt(<KeyHints hints={hints} />, USUAL_COLUMNS)).toBe(
      'enter improve  after a scan',
    );
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should draw the arrow keys in ASCII', () => {
      const hints: readonly KeyHint[] = [
        { key: 'right', label: 'details' },
        { key: 'esc', label: 'back', role: 'danger' },
      ];

      expect(
        drawnAt(
          drawnWith({ unicode: false }, <KeyHints hints={hints} joined />),
          USUAL_COLUMNS,
        ),
      ).toBe('> details . esc back');
    });
  });

  it.each(WIDTHS)('should fit the footer in %i columns', (columns) => {
    const drawn = drawnAt(<KeyHints hints={FOOTER} />, columns);

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
