import { describe, expect, it } from 'vitest';

import { lastLinesOf } from '#api/last-lines';

describe('lastLinesOf', () => {
  it('should give the lines without the empty ones', () => {
    expect(lastLinesOf('first\r\n\n  \nsecond\n')).toEqual(['first', 'second']);
  });

  it('should give no line of an empty text', () => {
    expect(lastLinesOf('')).toEqual([]);
  });

  describe('when the text has more than twenty lines', () => {
    it('should give the last twenty', () => {
      const lines = Array.from({ length: 25 }, (_, at) => `line ${String(at)}`);

      const last = lastLinesOf(lines.join('\n'));

      expect(last).toHaveLength(20);
      expect(last[0]).toBe('line 5');
      expect(last.at(-1)).toBe('line 24');
    });
  });
});
