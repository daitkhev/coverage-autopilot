import { describe, expect, it } from 'vitest';

import { destinationWords, repositoryName, shortHash } from '#theme/names';

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

describe('destinationWords', () => {
  it('should name the repository itself when the account may push', () => {
    expect(destinationWords({ route: 'repository' })).toBe(
      'the repository itself',
    );
  });

  it('should name the account of the fork when it may not', () => {
    expect(destinationWords({ route: 'fork', account: 'payments-bot' })).toBe(
      'a fork in the account payments-bot',
    );
  });
});
