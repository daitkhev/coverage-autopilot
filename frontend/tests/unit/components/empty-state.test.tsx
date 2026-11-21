import { describe, expect, it } from 'vitest';

import { EmptyState } from '#components/empty-state';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const EMPTY = (
  <EmptyState sentence="No repositories yet." keyName="a" action="to add one" />
);

describe('EmptyState', () => {
  it('should say what is missing and the key that changes it', () => {
    expect(drawnAt(EMPTY, USUAL_COLUMNS)).toMatchSnapshot();
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    expect(widestLine(drawnAt(EMPTY, columns))).toBeLessThanOrEqual(columns);
  });
});
