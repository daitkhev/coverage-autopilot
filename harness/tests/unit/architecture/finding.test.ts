import { describe, expect, it } from '@jest/globals';

import {
  compareFindings,
  type Finding,
  formatFinding,
} from '#harness/architecture/finding';

function finding(path: string, line: number, rule: string): Finding {
  return { path, line, rule, detail: 'detail' };
}

describe('compareFindings', () => {
  it('should order by path, then line, then rule', () => {
    const findings = [
      finding('b.ts', 1, 'x'),
      finding('a.ts', 2, 'x'),
      finding('a.ts', 1, 'y'),
      finding('a.ts', 1, 'x'),
    ];

    expect(findings.sort(compareFindings)).toEqual([
      finding('a.ts', 1, 'x'),
      finding('a.ts', 1, 'y'),
      finding('a.ts', 2, 'x'),
      finding('b.ts', 1, 'x'),
    ]);
  });

  it.each([
    ['path', finding('a.ts', 1, 'x'), finding('b.ts', 1, 'x')],
    ['line', finding('a.ts', 1, 'x'), finding('a.ts', 2, 'x')],
    ['rule', finding('a.ts', 1, 'x'), finding('a.ts', 1, 'y')],
  ])('should order by %s the same from both sides', (_, first, second) => {
    expect(compareFindings(first, second)).toBeLessThan(0);
    expect(compareFindings(second, first)).toBeGreaterThan(0);
  });

  it('should call two equal findings equal', () => {
    expect(compareFindings(finding('a', 1, 'x'), finding('a', 1, 'x'))).toBe(0);
  });
});

describe('formatFinding', () => {
  it('should put the place first, then the rule and the detail', () => {
    expect(formatFinding(finding('src/a.ts', 3, 'file-name'))).toBe(
      'src/a.ts:3 file-name detail',
    );
  });
});
