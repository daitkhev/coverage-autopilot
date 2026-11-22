import { describe, expect, it } from 'vitest';

import { repositoryName, shortHash } from '#theme/names';

describe('shortHash', () => {
  it('should keep the first seven characters, as git prints them', () => {
    expect(shortHash('4f2a9c1000000000000000000000000000000000')).toBe(
      '4f2a9c1',
    );
  });
});

describe('repositoryName', () => {
  it('should name a repository by its owner and its name', () => {
    expect(repositoryName({ owner: 'example', name: 'payments' })).toBe(
      'example/payments',
    );
  });
});
