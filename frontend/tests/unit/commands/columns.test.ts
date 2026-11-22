import { describe, expect, it } from 'vitest';

import {
  alignedRow,
  alignedRows,
  columnWidths,
  labelled,
} from '#commands/columns';

describe('alignedRows', () => {
  it('should make each column as wide as its widest cell', () => {
    expect(
      alignedRows([
        ['example/payments', '71.4%', 'main'],
        ['example/billing-api', '9.0%', 'trunk'],
      ]),
    ).toEqual([
      'example/payments     71.4%  main',
      'example/billing-api  9.0%   trunk',
    ]);
  });

  it('should leave no spaces behind empty last cells', () => {
    expect(
      alignedRows([
        ['a', 'b', ''],
        ['ccc', '', ''],
      ]),
    ).toEqual(['a    b', 'ccc']);
  });
});

describe('alignedRow', () => {
  it('should leave a cell past the known columns as it is', () => {
    const widths = columnWidths([['abc']]);

    expect(alignedRow(['a', 'b'], widths)).toBe('a    b');
  });
});

describe('labelled', () => {
  it('should start every text in one column', () => {
    expect(labelled('analyzing', 'lines 41.2%')).toBe(
      'analyzing    lines 41.2%',
    );
    expect(labelled('attempt 1', 'rejected')).toBe('attempt 1    rejected');
  });

  it('should keep a space after a label that fills its column', () => {
    expect(labelled('pull request', 'url')).toBe('pull request url');
  });

  it('should leave nothing behind a label with no text', () => {
    expect(labelled('publishing', '')).toBe('publishing');
  });
});
