import { describe, expect, it, xit } from '@jest/globals';

describe.skip('a group that does not run', () => {
  it('should be skipped', () => {
    expect('a').toBe('a');
  });
});

describe('a group', () => {
  it.skip('should be skipped', () => {
    expect('a').toBe('a');
  });

  xit('should be skipped the old way', () => {
    expect('a').toBe('a');
  });

  it('has no body');
});
