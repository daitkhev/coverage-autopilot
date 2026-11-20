import { describe, expect, it } from '@jest/globals';

import { limitFindings, LIMITS } from '#harness/architecture/limit-changes';

const BASE = {
  schema: 1,
  function: { lines: 50, depth: 3 },
  file: { lines: 300 },
  coverage: { lines: 95 },
};

function detailsFor(current: Record<string, unknown>): string[] {
  return limitFindings(BASE, current).map((finding) => finding.detail);
}

describe('limitFindings', () => {
  it('should pass limits that did not move', () => {
    expect(limitFindings(BASE, BASE)).toEqual([]);
  });

  it('should report a ceiling that went up', () => {
    const current = { ...BASE, function: { lines: 60, depth: 3 } };

    expect(limitFindings(BASE, current)).toEqual([
      {
        rule: 'limit-loosened',
        path: LIMITS,
        line: 1,
        detail: '"function.lines" went up from 50 to 60. It moves one way.',
      },
    ]);
  });

  it('should report a floor that went down', () => {
    expect(detailsFor({ ...BASE, coverage: { lines: 90 } })).toEqual([
      '"coverage.lines" went down from 95 to 90. It moves one way.',
    ]);
  });

  it('should pass a ceiling that went down and a floor that went up', () => {
    const current = {
      ...BASE,
      file: { lines: 250 },
      coverage: { lines: 97 },
    };

    expect(detailsFor(current)).toEqual([]);
  });

  it('should take the share of duplication for a ceiling', () => {
    const before = { ...BASE, duplication: { percent: 0.9 } };
    const after = { ...BASE, duplication: { percent: 1.5 } };

    expect(limitFindings(before, after).map((f) => f.detail)).toEqual([
      '"duplication.percent" went up from 0.9 to 1.5. It moves one way.',
    ]);
    expect(limitFindings(after, before)).toEqual([]);
  });

  it('should report a number that was removed', () => {
    expect(detailsFor({ ...BASE, file: {} })).toEqual([
      '"file.lines" was removed.',
    ]);
  });

  it('should pass a new number of a known kind', () => {
    const current = { ...BASE, coverage: { lines: 95, branches: 90 } };

    expect(detailsFor(current)).toEqual([]);
  });

  it('should report a number it cannot tell the direction of', () => {
    expect(detailsFor({ ...BASE, budget: { seconds: 10 } })).toEqual([
      '"budget.seconds" is not known as a ceiling or as a floor.',
    ]);
  });

  it('should not take the schema number for a limit', () => {
    expect(limitFindings(BASE, { ...BASE, schema: 2 })).toEqual([]);
  });
});
