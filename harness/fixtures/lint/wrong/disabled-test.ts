import { describe, expect, it } from 'vitest';

describe.skip('a group that does not run', () => {
  it('should be skipped', () => {
    expect('a').toBe('a');
  });
});

describe('a group', () => {
  it.skip('should be skipped', () => {
    expect('a').toBe('a');
  });

  it('has no body');
});
