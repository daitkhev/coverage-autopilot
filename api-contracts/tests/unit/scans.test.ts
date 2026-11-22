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

  it.each([
    ['unsupported_project', 'The repository has no test runner.'],
    ['install_failed', 'npm ci exited 1.'],
    ['test_run_timed_out', 'The tests ran past 20 minutes.'],
    ['coverage_report_missing', 'The test runner wrote no report.'],
    ['retries_exhausted', 'The scan was tried 3 times.'],
  ])('should accept a scan that failed with %s', (reason, message) => {
    const value = {
      ...running,
      status: 'failed',
      progress: null,
      failure: { reason, message },
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
