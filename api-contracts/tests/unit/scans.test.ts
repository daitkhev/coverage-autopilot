import { describe, expect, it } from 'vitest';

import { scanSchema } from '#api-contracts/scans';

const running = {
  id: 'scan1',
  repositoryId: 'r1',
  status: 'running',
  queuedAt: '2026-11-21T10:00:00.000Z',
  startedAt: '2026-11-21T10:00:02.000Z',
  finishedAt: null,
  progress: {
    steps: [{ code: 'install', status: 'running' }],
    updatedAt: '2026-11-21T10:00:05.000Z',
  },
  snapshotId: null,
  failure: null,
};

describe('scanSchema', () => {
  it('should accept a running scan with its steps', () => {
    expect(scanSchema.safeParse(running).success).toBe(true);
  });

  it('should accept a scan that failed with a reason', () => {
    const value = {
      ...running,
      status: 'failed',
      progress: null,
      failure: { reason: 'install_failed', message: 'npm ci exited 1.' },
    };

    expect(scanSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing status', { ...running, status: undefined }],
    ['a job status', { ...running, status: 'leased' }],
    [
      'an unknown failure reason',
      { ...running, failure: { reason: 'oops', message: 'x' } },
    ],
    ['an unknown key', { ...running, jobId: 'j1' }],
  ])('should refuse %s', (_name, value) => {
    expect(scanSchema.safeParse(value).success).toBe(false);
  });
});
