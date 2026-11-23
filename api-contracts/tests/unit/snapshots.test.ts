import { describe, expect, it } from 'vitest';

import {
  fileCoverageSchema,
  snapshotFilesQuerySchema,
  snapshotFilesSchema,
  snapshotListSchema,
} from '#api-contracts/snapshots';

const part = { covered: 1, total: 2, percentage: 50 };
const counters = {
  statements: part,
  branches: part,
  functions: part,
  lines: part,
};
const threshold = { metric: 'branches', percentage: 80 };

const snapshot = {
  id: 's1',
  commitSha: 'c'.repeat(40),
  capturedAt: '2026-11-21T09:00:00.000Z',
  totals: counters,
  threshold,
  files: { below: 3, above: 9, unmeasured: 1, noCode: 2 },
  tests: { ran: 53, failed: 33 },
  repositoryId: 'r1',
  parameters: {
    testRunner: 'vitest',
    testRunnerVersion: '4.1.12',
    coverageProvider: 'v8',
    packageManager: 'npm',
    configFile: 'vitest.config.ts',
    fileListRule: 'project',
  },
};

const measured = {
  path: 'src/billing/invoice.ts',
  state: 'measured',
  coverage: counters,
  belowThreshold: true,
  uncoveredLines: [{ start: 12, end: 18 }],
  openBranchLines: [14],
  uncoveredFunctions: [{ name: 'refund', line: 40 }],
  latestImprovement: { id: 'i1', status: 'verifying' },
};

const unmeasured = {
  path: 'src/broken.ts',
  state: 'unmeasured',
  reason: 'parse_failed',
  toolMessage: "')' expected.",
};

describe('snapshotListSchema', () => {
  it('should accept a list of snapshots', () => {
    const value = { items: [snapshot] };

    expect(snapshotListSchema.safeParse(value).success).toBe(true);
  });

  it('should accept a snapshot whose tests were not counted', () => {
    const value = { items: [{ ...snapshot, tests: null }] };

    expect(snapshotListSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing commit', { ...snapshot, commitSha: undefined }],
    ['a short commit', { ...snapshot, commitSha: 'abc123' }],
    [
      'a negative file count',
      { ...snapshot, files: { ...snapshot.files, below: -1 } },
    ],
    ['an unknown key', { ...snapshot, branch: 'main' }],
    ['no word on its tests', { ...snapshot, tests: undefined }],
    ['a part of a test', { ...snapshot, tests: { ran: 2, failed: 0.5 } }],
    ['tests that did not run', { ...snapshot, tests: { ran: -1, failed: 0 } }],
  ])('should refuse %s', (_name, value) => {
    expect(snapshotListSchema.safeParse({ items: [value] }).success).toBe(
      false,
    );
  });
});

describe('fileCoverageSchema', () => {
  it.each([
    ['a measured file', measured],
    [
      'a file with no code',
      { path: 'src/types.ts', state: 'no_executable_code' },
    ],
    ['an unmeasured file', unmeasured],
  ])('should accept %s', (_name, value) => {
    expect(fileCoverageSchema.safeParse(value).success).toBe(true);
  });

  describe('when a file was not measured', () => {
    it('should refuse a percentage', () => {
      const value = { ...unmeasured, coverage: counters };

      expect(fileCoverageSchema.safeParse(value).success).toBe(false);
    });

    it('should refuse an unknown reason', () => {
      const value = { ...unmeasured, reason: 'timeout' };

      expect(fileCoverageSchema.safeParse(value).success).toBe(false);
    });
  });

  it.each([
    ['an unknown state', { ...measured, state: 'partial' }],
    [
      'a missing counter',
      { ...measured, coverage: { ...counters, lines: undefined } },
    ],
    ['a line number of zero', { ...measured, openBranchLines: [0] }],
    [
      'a verdict as the status of the work',
      { ...measured, latestImprovement: { id: 'i1', status: 'rejected' } },
    ],
  ])('should refuse %s', (_name, value) => {
    expect(fileCoverageSchema.safeParse(value).success).toBe(false);
  });
});

describe('snapshotFilesSchema', () => {
  it('should accept the files of a snapshot', () => {
    const value = {
      snapshotId: 's1',
      threshold,
      items: [measured, unmeasured],
    };

    expect(snapshotFilesSchema.safeParse(value).success).toBe(true);
  });
});

describe('snapshotFilesQuerySchema', () => {
  it('should read the threshold from text', () => {
    const result = snapshotFilesQuerySchema.parse({
      below: '80',
      metric: 'lines',
    });

    expect(result).toEqual({ below: 80, metric: 'lines' });
  });

  it('should accept no filter', () => {
    expect(snapshotFilesQuerySchema.safeParse({}).success).toBe(true);
  });

  it.each([
    ['a threshold above 100', { below: '101' }],
    ['a threshold that is no number', { below: 'high' }],
    ['an unknown state', { state: 'broken' }],
    ['an unknown key', { sort: 'path' }],
  ])('should refuse %s', (_name, value) => {
    expect(snapshotFilesQuerySchema.safeParse(value).success).toBe(false);
  });
});
