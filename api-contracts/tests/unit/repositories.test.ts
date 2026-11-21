import { describe, expect, it } from 'vitest';

import {
  accessCheckSchema,
  connectRepositoryRequestSchema,
  repositoryListSchema,
} from '#api-contracts/repositories';

const repository = {
  id: 'r1',
  owner: 'example',
  name: 'payments',
  url: 'https://github.com/example/payments',
  defaultBranch: 'main',
  connectedAt: '2026-11-20T08:00:00Z',
  latestSnapshot: null,
  activeScanId: 'scan1',
};

describe('connectRepositoryRequestSchema', () => {
  it('should accept an HTTPS URL', () => {
    const value = { url: 'https://github.com/example/payments.git' };

    expect(connectRepositoryRequestSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing URL', {}],
    ['a URL over plain HTTP', { url: 'http://github.com/example/payments' }],
    ['an SSH address', { url: 'git@github.com:example/payments.git' }],
    ['a URL that is too long', { url: `https://x.io/${'a'.repeat(2048)}` }],
    ['an unknown key', { url: 'https://github.com/a/b', branch: 'dev' }],
  ])('should refuse %s', (_name, value) => {
    expect(connectRepositoryRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('repositoryListSchema', () => {
  it('should accept a repository that was never scanned', () => {
    const value = { items: [repository] };

    expect(repositoryListSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing owner', { ...repository, owner: undefined }],
    ['a time with no zone', { ...repository, connectedAt: '2026-11-20 08:00' }],
    ['an unknown key', { ...repository, stars: 3 }],
  ])('should refuse %s', (_name, value) => {
    expect(repositoryListSchema.safeParse({ items: [value] }).success).toBe(
      false,
    );
  });
});

describe('accessCheckSchema', () => {
  const check = {
    repositoryId: 'r1',
    checkedAt: '2026-11-21T10:00:00Z',
    passed: false,
    steps: [
      {
        name: 'git_present',
        status: 'passed',
        message: null,
        toolOutput: null,
      },
      {
        name: 'gh_authenticated',
        status: 'failed',
        message: 'Run gh auth login.',
        toolOutput: 'You are not logged into any GitHub hosts.',
      },
      {
        name: 'push_allowed',
        status: 'not_run',
        message: null,
        toolOutput: null,
      },
    ],
  };

  it('should accept a check that stopped at a failed step', () => {
    expect(accessCheckSchema.safeParse(check).success).toBe(true);
  });

  it.each([
    [
      'an unknown step',
      { name: 'ssh_key', status: 'passed', message: null, toolOutput: null },
    ],
    [
      'an unknown status',
      { name: 'git_present', status: 'error', message: null, toolOutput: null },
    ],
  ])('should refuse %s', (_name, step) => {
    const value = { ...check, steps: [step] };

    expect(accessCheckSchema.safeParse(value).success).toBe(false);
  });
});
