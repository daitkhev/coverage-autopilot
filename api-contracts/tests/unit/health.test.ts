import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, healthSchema } from '#api-contracts/health';

const health = {
  ready: true,
  contractVersion: CONTRACT_VERSION,
  serviceVersion: '0.1.0',
  startedAt: '2026-11-21T08:00:00.000Z',
  githubAccount: 'octocat',
  worker: { alive: true, lastSeenAt: '2026-11-21T10:00:00.000Z' },
  activeWork: { scans: 0, improvements: 2 },
  tools: [
    { name: 'git', version: '2.47.0' },
    { name: 'gh', version: null },
  ],
};

describe('healthSchema', () => {
  it('should accept the answer of a busy service', () => {
    expect(healthSchema.safeParse(health).success).toBe(true);
  });

  it('should accept a service of another contract version', () => {
    const value = { ...health, contractVersion: CONTRACT_VERSION + 1 };

    expect(healthSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a version of zero', { ...health, contractVersion: 0 }],
    ['a version as text', { ...health, contractVersion: '1' }],
    ['a missing worker', { ...health, worker: undefined }],
    [
      'a negative count of work',
      { ...health, activeWork: { scans: -1, improvements: 0 } },
    ],
    ['an unknown key', { ...health, pid: 4242 }],
  ])('should refuse %s', (_name, value) => {
    expect(healthSchema.safeParse(value).success).toBe(false);
  });
});
