import { describe, expect, it } from 'vitest';

import { attemptSchema, checkResultSchema } from '#api-contracts/attempts';

const HASH = 'd'.repeat(64);
const before = { covered: 3, total: 8, percentage: 37.5 };
const after = { covered: 7, total: 8, percentage: 87.5 };

const check = {
  name: 'repeated_runs',
  status: 'passed',
  retryable: false,
  durationMs: 5400,
  runs: 3,
  message: null,
};

const rejected = {
  number: 2,
  status: 'closed',
  startedAt: '2026-11-21T10:05:00.000Z',
  finishedAt: '2026-11-21T10:12:00.000Z',
  generationOutcome: 'generated',
  tokensUsed: 18000,
  patchHash: HASH,
  report: {
    patchHash: HASH,
    verdict: 'rejected',
    reasons: ['The new tests detect 0 of 14 mutants.'],
    checks: [check],
    coverageBefore: {
      statements: before,
      branches: before,
      functions: before,
      lines: before,
    },
    coverageAfter: {
      statements: after,
      branches: after,
      functions: after,
      lines: after,
    },
    mutants: { undetectedBefore: 14, killed: 0, reached: 9 },
    survivingMutants: [
      {
        line: 42,
        mutator: 'EqualityOperator',
        replacement: '>=',
        reached: true,
      },
    ],
  },
  rawOutputPaths: ['/var/autopilot/output/i1/2/stryker.log'],
};

describe('checkResultSchema', () => {
  it('should accept a check that ran three times', () => {
    expect(checkResultSchema.safeParse(check).success).toBe(true);
  });

  it.each([
    ['an unknown check', { ...check, name: 'lint' }],
    ['a verdict as a status', { ...check, status: 'accepted' }],
    ['a missing retry flag', { ...check, retryable: undefined }],
  ])('should refuse %s', (_name, value) => {
    expect(checkResultSchema.safeParse(value).success).toBe(false);
  });
});

describe('attemptSchema', () => {
  it('should accept a rejected attempt with its report', () => {
    expect(attemptSchema.safeParse(rejected).success).toBe(true);
  });

  it('should accept an open attempt that has no patch yet', () => {
    const open = {
      ...rejected,
      status: 'open',
      finishedAt: null,
      generationOutcome: null,
      tokensUsed: 0,
      patchHash: null,
      report: null,
      rawOutputPaths: [],
    };

    expect(attemptSchema.safeParse(open).success).toBe(true);
  });

  it('should accept a report of a gate that stopped before it measured the target', () => {
    const refused = {
      ...rejected,
      report: {
        ...rejected.report,
        coverageBefore: null,
        coverageAfter: null,
        mutants: null,
        survivingMutants: [],
      },
    };

    expect(attemptSchema.safeParse(refused).success).toBe(true);
  });

  it.each([
    ['an attempt number of zero', { ...rejected, number: 0 }],
    ['an unknown outcome', { ...rejected, generationOutcome: 'crashed' }],
    ['a short patch hash', { ...rejected, patchHash: 'abc' }],
    [
      'an unknown verdict',
      { ...rejected, report: { ...rejected.report, verdict: 'maybe' } },
    ],
    ['an improvement status', { ...rejected, status: 'verifying' }],
    ['an unknown key', { ...rejected, model: 'opus' }],
  ])('should refuse %s', (_name, value) => {
    expect(attemptSchema.safeParse(value).success).toBe(false);
  });
});
