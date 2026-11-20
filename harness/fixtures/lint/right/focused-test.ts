import { describe, expect, it } from '@jest/globals';

describe('a group', () => {
  it('should run with the rest', () => {
    expect('a').toBe('a');
  });

  it.each(['a', 'b'])('should run for %s', (letter) => {
    expect(letter).toBe(letter);
  });
});
