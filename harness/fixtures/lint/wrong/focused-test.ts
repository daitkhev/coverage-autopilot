import { describe, expect, it } from 'vitest';

describe.only('a focused group', () => {
  it('should run alone', () => {
    expect('a').toBe('a');
  });

  it.only('should run alone too', () => {
    expect('a').toBe('a');
  });
});
