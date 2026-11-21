import { describe, expect, it } from 'vitest';

import { progressSchema } from '#api-contracts/progress';

const progress = {
  steps: [
    { code: 'test_files_only', status: 'passed' },
    { code: 'repeated_runs', status: 'running', done: 2, total: 3 },
    { code: 'mutation_gain', status: 'pending' },
  ],
  updatedAt: '2026-11-21T10:00:00Z',
};

describe('progressSchema', () => {
  it('should accept the steps of a phase', () => {
    expect(progressSchema.safeParse(progress).success).toBe(true);
  });

  it('should accept a phase with no steps yet', () => {
    const value = { ...progress, steps: [] };

    expect(progressSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing time', { steps: progress.steps }],
    ['an unknown step status', withStep({ code: 'clone', status: 'done' })],
    ['a step with no code', withStep({ code: '', status: 'running' })],
    [
      'a negative counter',
      withStep({ code: 'clone', status: 'running', done: -1 }),
    ],
    [
      'an unknown step key',
      withStep({ code: 'clone', status: 'running', at: 1 }),
    ],
  ])('should refuse %s', (_name, value) => {
    expect(progressSchema.safeParse(value).success).toBe(false);
  });
});

function withStep(step: object): object {
  return { ...progress, steps: [step] };
}
