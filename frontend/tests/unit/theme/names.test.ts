import { describe, expect, it } from 'vitest';

import { shortHash } from '#theme/names';

describe('shortHash', () => {
  it('should keep the first seven characters, as git prints them', () => {
    expect(shortHash('4f2a9c1000000000000000000000000000000000')).toBe(
      '4f2a9c1',
    );
  });
});
