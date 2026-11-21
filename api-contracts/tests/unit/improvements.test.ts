import { describe, expect, it } from 'vitest';

import {
  approveImprovementRequestSchema,
  budgetSettingsSchema,
  improvementListQuerySchema,
  improvementListSchema,
  improvementPatchSchema,
  improvementSchema,
  startImprovementRequestSchema,
} from '#api-contracts/improvements';

const HASH = 'e'.repeat(64);

const request = {
  snapshotId: 's1',
  filePath: 'src/billing/invoice.ts',
  mode: 'review',
  budget: { attempts: 3 },
  qualityPolicy: {
    requiredChecks: ['test_files_only', 'mutation_gain'],
    repeatedRuns: 3,
    mutationThreshold: 60,
  },
  generator: { cli: 'claude_code', model: 'claude-opus-5-5' },
};

const improvement = {
  id: 'i1',
  repositoryId: 'r1',
  sourceSnapshotId: 's1',
  baselineSnapshotId: 's2',
  baseCommit: 'f'.repeat(40),
  targetFile: request.filePath,
  status: 'awaiting_approval',
  mode: 'review',
  waitingFor: 'approval',
  phaseStartedAt: '2026-11-21T10:20:00.000Z',
  budget: { attempts: 3, tokens: 200000, minutes: 45 },
  usage: { attempts: 2, tokens: 36000, seconds: 1210 },
  deadlineAt: '2026-11-21T10:45:00.000Z',
  resumesAt: null,
  limitWaits: 0,
  qualityPolicy: request.qualityPolicy,
  generator: { ...request.generator, promptVersion: '3', billing: 'api_key' },
  attempts: [],
  progress: null,
  branch: null,
  pullRequest: null,
  failure: null,
  skip: null,
  createdAt: '2026-11-21T10:00:00.000Z',
  updatedAt: '2026-11-21T10:20:00.000Z',
  cancelledAt: null,
};

describe('startImprovementRequestSchema', () => {
  it('should accept every choice of the request', () => {
    expect(startImprovementRequestSchema.safeParse(request).success).toBe(true);
  });

  it('should leave the defaults to the service', () => {
    const value = { snapshotId: 's1', filePath: request.filePath };

    expect(startImprovementRequestSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing file', { ...request, filePath: undefined }],
    ['a file outside the repository', { ...request, filePath: '../x.ts' }],
    ['an unknown mode', { ...request, mode: 'manual' }],
    ['a budget of zero attempts', { ...request, budget: { attempts: 0 } }],
    ['an unknown budget key', { ...request, budget: { dollars: 5 } }],
    [
      'an unknown check',
      {
        ...request,
        qualityPolicy: { ...request.qualityPolicy, requiredChecks: ['lint'] },
      },
    ],
    [
      'a mutation threshold out of range',
      {
        ...request,
        qualityPolicy: { ...request.qualityPolicy, mutationThreshold: 140 },
      },
    ],
    [
      'an unknown generator',
      { ...request, generator: { cli: 'aider', model: 'x' } },
    ],
    [
      'a prompt version from the client',
      { ...request, generator: improvement.generator },
    ],
    ['an unknown key', { ...request, fingerprint: 'abc' }],
  ])('should refuse %s', (_name, value) => {
    expect(startImprovementRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('improvementSchema', () => {
  it('should accept an improvement that waits for approval', () => {
    expect(improvementSchema.safeParse(improvement).success).toBe(true);
  });

  it('should accept a failed improvement with its reason', () => {
    const failed = {
      ...improvement,
      status: 'failed',
      waitingFor: null,
      failure: {
        reason: 'budget_exhausted',
        message: '3 attempts were rejected.',
      },
    };

    expect(improvementSchema.safeParse(failed).success).toBe(true);
  });

  it('should accept an improvement that waits for a window to open', () => {
    const waiting = {
      ...improvement,
      status: 'waiting_for_limit',
      waitingFor: 'limit',
      resumesAt: '2026-11-21T14:30:00.000Z',
      limitWaits: 1,
      budget: { ...improvement.budget, tokens: null },
      generator: { ...improvement.generator, billing: 'subscription' },
    };

    expect(improvementSchema.safeParse(waiting).success).toBe(true);
  });

  it.each([
    ['a missing status', { ...improvement, status: undefined }],
    ['a missing count of waits', { ...improvement, limitWaits: undefined }],
    [
      'an unknown way to pay',
      {
        ...improvement,
        generator: { ...improvement.generator, billing: 'invoice' },
      },
    ],
    [
      'a budget in money',
      { ...improvement, budget: { ...improvement.budget, dollars: 5 } },
    ],
    ['a verdict as the status', { ...improvement, status: 'rejected' }],
    [
      'an unknown failure reason',
      { ...improvement, failure: { reason: 'tired', message: 'x' } },
    ],
    [
      'an unknown skip reason',
      { ...improvement, skip: { reason: 'bored', message: 'x' } },
    ],
    [
      'a pull request with no URL',
      { ...improvement, pullRequest: { number: 131 } },
    ],
    [
      'negative usage',
      { ...improvement, usage: { ...improvement.usage, tokens: -1 } },
    ],
    ['an unknown key', { ...improvement, jobId: 'j1' }],
  ])('should refuse %s', (_name, value) => {
    expect(improvementSchema.safeParse(value).success).toBe(false);
  });
});

describe('improvementListSchema', () => {
  it('should accept a list of improvements', () => {
    const value = { items: [improvement] };

    expect(improvementListSchema.safeParse(value).success).toBe(true);
  });
});

describe('improvementListQuerySchema', () => {
  it('should accept a filter by repository, status and file', () => {
    const value = {
      repositoryId: 'r1',
      status: 'failed',
      filePath: 'src/billing/invoice.ts',
    };

    expect(improvementListQuerySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['an unknown status', { status: 'done' }],
    ['a file outside the repository', { filePath: '../a.ts' }],
    ['an unknown key', { file: 'src/a.ts' }],
  ])('should refuse %s', (_name, value) => {
    expect(improvementListQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe('budgetSettingsSchema', () => {
  const settings = {
    defaults: { attempts: 3, tokens: null, minutes: 30 },
    maximums: { attempts: 10, tokens: null, minutes: 120 },
  };

  it('should accept the settings of a subscription, with no tokens', () => {
    expect(budgetSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it('should accept a limit of tokens for a key', () => {
    const value = {
      defaults: { ...settings.defaults, tokens: 200000 },
      maximums: { ...settings.maximums, tokens: 1000000 },
    };

    expect(budgetSettingsSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['no maximums', { defaults: settings.defaults }],
    [
      'a default with no minutes',
      { ...settings, defaults: { attempts: 3, tokens: null } },
    ],
  ])('should refuse %s', (_name, value) => {
    expect(budgetSettingsSchema.safeParse(value).success).toBe(false);
  });
});

describe('improvementPatchSchema', () => {
  const patch = {
    improvementId: 'i1',
    attemptNumber: 2,
    patch: 'diff --git a/tests/a.test.ts b/tests/a.test.ts\n',
    patchHash: HASH,
  };

  it('should accept a patch with its hash', () => {
    expect(improvementPatchSchema.safeParse(patch).success).toBe(true);
  });

  it.each([
    ['an empty patch', { ...patch, patch: '' }],
    ['a missing hash', { ...patch, patchHash: undefined }],
  ])('should refuse %s', (_name, value) => {
    expect(improvementPatchSchema.safeParse(value).success).toBe(false);
  });
});

describe('approveImprovementRequestSchema', () => {
  it('should accept the hash of the patch on the screen', () => {
    const value = { patchHash: HASH };

    expect(approveImprovementRequestSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing hash', {}],
    ['a hash in capitals', { patchHash: HASH.toUpperCase() }],
  ])('should refuse %s', (_name, value) => {
    expect(approveImprovementRequestSchema.safeParse(value).success).toBe(
      false,
    );
  });
});
