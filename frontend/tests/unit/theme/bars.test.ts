import { describe, expect, it } from 'vitest';

import {
  barRunsOf,
  coverageRoleOf,
  fractionOfPercent,
  limitRoleOf,
} from '#theme/bars';

describe('barRunsOf', () => {
  it('should fill the share of the cells', () => {
    expect(barRunsOf({ filled: 0.4, cells: 10 })).toEqual([
      { part: 'filled', length: 4 },
      { part: 'empty', length: 6 },
    ]);
  });

  it('should put the tick of the threshold in a cell of its own', () => {
    expect(barRunsOf({ filled: 0.4, cells: 10, tick: 0.8 })).toEqual([
      { part: 'filled', length: 4 },
      { part: 'empty', length: 4 },
      { part: 'tick', length: 1 },
      { part: 'empty', length: 1 },
    ]);
  });

  it('should draw a bar past its tick', () => {
    expect(barRunsOf({ filled: 0.9, cells: 10, tick: 0.5 })).toEqual([
      { part: 'filled', length: 5 },
      { part: 'tick', length: 1 },
      { part: 'filled', length: 3 },
      { part: 'empty', length: 1 },
    ]);
  });

  it('should keep the tick of a full threshold inside the bar', () => {
    expect(barRunsOf({ filled: 1, cells: 4, tick: 1 })).toEqual([
      { part: 'filled', length: 3 },
      { part: 'tick', length: 1 },
    ]);
  });

  it('should keep a share outside 0 to 1 inside the bar', () => {
    expect(barRunsOf({ filled: 1.5, cells: 3 })).toEqual([
      { part: 'filled', length: 3 },
    ]);
    expect(barRunsOf({ filled: -1, cells: 3 })).toEqual([
      { part: 'empty', length: 3 },
    ]);
  });
});

describe('fractionOfPercent', () => {
  it('should turn a percentage into a share', () => {
    expect(fractionOfPercent(41.2)).toBeCloseTo(0.412);
  });
});

describe('coverageRoleOf', () => {
  it('should be green at the threshold and yellow below it', () => {
    expect(coverageRoleOf(80, 80)).toBe('success');
    expect(coverageRoleOf(79.9, 80)).toBe('warning');
  });
});

describe('limitRoleOf', () => {
  it('should be plain below 80% of the limit', () => {
    expect(limitRoleOf(79, 100)).toBe('primary');
  });

  it('should be yellow from 80% of the limit', () => {
    expect(limitRoleOf(80, 100)).toBe('warning');
  });

  it('should be red when the limit is spent', () => {
    expect(limitRoleOf(100, 100)).toBe('danger');
  });
});
