import { describe, expect, it } from 'vitest';

import { DIALOG_WIDTH, layoutOf, SMALLEST_SIZE } from '#theme/widths';

describe('layoutOf', () => {
  it.each([
    [{ columns: 112, rows: 34 }, 'wide'],
    [{ columns: 110, rows: 24 }, 'wide'],
    [{ columns: 109, rows: 24 }, 'compact'],
    [{ columns: 90, rows: 24 }, 'compact'],
    [{ columns: 89, rows: 24 }, 'narrow'],
    [{ columns: 80, rows: 24 }, 'narrow'],
    [{ columns: 252, rows: 20 }, 'wide'],
    [{ columns: 80, rows: 16 }, 'narrow'],
    [{ columns: 79, rows: 40 }, 'too-small'],
    [{ columns: 120, rows: 15 }, 'too-small'],
  ])('should lay out %o as %s', (size, layout) => {
    expect(layoutOf(size)).toBe(layout);
  });
});

describe('DIALOG_WIDTH', () => {
  it('should fit every dialog in the smallest terminal', () => {
    expect(Math.max(...Object.values(DIALOG_WIDTH))).toBeLessThan(
      SMALLEST_SIZE.columns,
    );
  });
});
