import { describe, expect, it } from '@jest/globals';

import { double } from '../src/used';

describe('double', () => {
  it('should double a number', () => {
    expect(double(2)).toBe(4);
  });
});
