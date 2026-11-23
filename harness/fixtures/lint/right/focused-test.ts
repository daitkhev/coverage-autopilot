import { describe, expect, it } from 'vitest';

describe('a group', () => {
  it('should run with the rest', () => {
    expect('a').toBe('a');
  });

  it.each(['a', 'b'])('should run for %s', (letter) => {
    expect(letter).toBe(letter);
  });
});
