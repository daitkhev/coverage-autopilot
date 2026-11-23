import { describe, expect, it } from 'vitest';

import { DiffViewer } from '#components/diff-viewer';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const PATCH = [
  "import { total, applyDiscount } from './invoice';",
  '',
  "describe('total', () => {",
  "  it('should add tax to the net amount', () => {",
  '    expect(total({ net: 100, taxRate: 0.2 })).toBe(120);',
  '  });',
  '});',
  '',
  "describe('applyDiscount', () => {",
  "  it('should keep the amount at a zero rate', () => {",
  '    expect(applyDiscount({ amount: 100, rate: 0 })).toBe(100);',
  '  });',
];

describe('DiffViewer', () => {
  it('should draw the added lines with their numbers', () => {
    expect(
      drawnAt(
        <DiffViewer lines={PATCH} offset={0} visible={8} />,
        USUAL_COLUMNS,
      ),
    ).toMatchSnapshot();
  });

  it('should start at the scroll position', () => {
    const drawn = drawnAt(
      <DiffViewer lines={PATCH} offset={10} visible={8} />,
      USUAL_COLUMNS,
    );

    expect(drawn).toBe(
      [
        '  11 +     expect(applyDiscount({ amount: 100, rate: 0 })).toBe(100);',
        '  12 +   });',
      ].join('\n'),
    );
  });

  it('should cut a line too long for the width', () => {
    const drawn = drawnAt(
      <DiffViewer lines={['x'.repeat(200)]} offset={0} visible={1} />,
      USUAL_COLUMNS,
    );

    expect(drawn.split('\n')).toHaveLength(1);
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = drawnAt(
      <DiffViewer lines={PATCH} offset={0} visible={8} />,
      columns,
    );

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
