import { describe, expect, it } from 'vitest';

import {
  accessCheckSchema,
  changeInstallModeRequestSchema,
  changeThresholdRequestSchema,
  connectRepositoryRequestSchema,
  repositoryInstallSchema,
  repositoryListSchema,
  repositoryThresholdSchema,
} from '#api-contracts/repositories';

const repository = {
  id: 'r1',
  owner: 'example',
  name: 'payments',
  url: 'https://github.com/example/payments',
  defaultBranch: 'main',
  connectedAt: '2026-11-20T08:00:00.000Z',
  latestSnapshot: null,
  activeScanId: 'scan1',
  headCommit: null,
  outdated: false,
  threshold: { metric: 'lines', percentage: 80, isDefault: true },
  install: { mode: 'sandboxed', isDefault: true },
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

  it('should accept a repository whose head moved since the scan', () => {
    const value = { ...repository, headCommit: 'a'.repeat(40), outdated: true };

    expect(repositoryListSchema.safeParse({ items: [value] }).success).toBe(
      true,
    );
  });

  it.each([
    ['a missing owner', { ...repository, owner: undefined }],
    ['a short hash of the head', { ...repository, headCommit: 'a1b2c3d' }],
    [
      'no word on whether it is outdated',
      { ...repository, outdated: undefined },
    ],
    ['a time with no zone', { ...repository, connectedAt: '2026-11-20 08:00' }],
    ['no threshold', { ...repository, threshold: undefined }],
    ['no install', { ...repository, install: undefined }],
    ['an unknown key', { ...repository, stars: 3 }],
  ])('should refuse %s', (_name, value) => {
    expect(repositoryListSchema.safeParse({ items: [value] }).success).toBe(
      false,
    );
  });
});

describe('repositoryThresholdSchema', () => {
  it('should accept a threshold of its own', () => {
    const value = { metric: 'lines', percentage: 95, isDefault: false };

    expect(repositoryThresholdSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    [
      'no word on whether it is the default',
      { metric: 'lines', percentage: 80 },
    ],
    [
      'a counter that is not one',
      { metric: 'calls', percentage: 80, isDefault: true },
    ],
    [
      'more than everything',
      { metric: 'lines', percentage: 101, isDefault: false },
    ],
    [
      'an unknown key',
      { metric: 'lines', percentage: 80, isDefault: true, own: 95 },
    ],
  ])('should refuse %s', (_name, value) => {
    expect(repositoryThresholdSchema.safeParse(value).success).toBe(false);
  });
});

describe('repositoryInstallSchema', () => {
  it.each(['sandboxed', 'trusted'])(
    'should accept a %s install of its own',
    (mode) => {
      const value = { mode, isDefault: false };

      expect(repositoryInstallSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['no word on whether it is the default', { mode: 'trusted' }],
    ['a mode that is not one', { mode: 'open', isDefault: false }],
    ['an unknown key', { mode: 'trusted', isDefault: false, network: 'open' }],
  ])('should refuse %s', (_name, value) => {
    expect(repositoryInstallSchema.safeParse(value).success).toBe(false);
  });
});

describe('changeInstallModeRequestSchema', () => {
  it.each([['sandboxed'], ['trusted'], [null]])(
    'should accept a mode of %s',
    (mode) => {
      const value = { mode };

      expect(changeInstallModeRequestSchema.safeParse(value).success).toBe(
        true,
      );
    },
  );

  it.each([
    ['no mode', {}],
    ['a mode that is not one', { mode: 'default' }],
    ['another field', { mode: 'trusted', network: 'open' }],
  ])('should refuse %s', (_name, value) => {
    expect(changeInstallModeRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('changeThresholdRequestSchema', () => {
  it.each([[1], [95], [100], [null]])(
    'should accept a percentage of %s',
    (percentage) => {
      const value = { percentage };

      expect(changeThresholdRequestSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([[0], [101], [85.5], ['95']])(
    'should refuse a percentage of %s',
    (percentage) => {
      const value = { percentage };

      expect(changeThresholdRequestSchema.safeParse(value).success).toBe(false);
    },
  );

  it('should refuse a body with no percentage or with another field', () => {
    expect(changeThresholdRequestSchema.safeParse({}).success).toBe(false);
    expect(
      changeThresholdRequestSchema.safeParse({
        percentage: 95,
        metric: 'lines',
      }).success,
    ).toBe(false);
  });
});

describe('accessCheckSchema', () => {
  const check = {
    repositoryId: 'r1',
    checkedAt: '2026-11-21T10:00:00.000Z',
    passed: false,
    headCommit: null,
    destination: null,
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
    ['the repository', { route: 'repository' }],
    ['a fork in an account', { route: 'fork', account: 'acme-bot' }],
  ])('should accept a passed check that sends a result to %s', (_name, to) => {
    const passed = { ...check, passed: true, destination: to };

    expect(accessCheckSchema.safeParse(passed).success).toBe(true);
  });

  it.each([
    ['a fork with no account', { route: 'fork' }],
    ['a fork with an empty account', { route: 'fork', account: '' }],
    ['an account of the repository', { route: 'repository', account: 'a' }],
    ['an unknown route', { route: 'mirror' }],
  ])('should refuse %s as a destination', (_name, to) => {
    const value = { ...check, destination: to };

    expect(accessCheckSchema.safeParse(value).success).toBe(false);
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
