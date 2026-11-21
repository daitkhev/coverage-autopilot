import { describe, expect, it } from 'vitest';

import {
  checkNameSchema,
  improvementStatusSchema,
  stepStatusSchema,
} from '#api-contracts/statuses';

describe('improvementStatusSchema', () => {
  it('should accept a status of the state machine', () => {
    const result = improvementStatusSchema.safeParse('awaiting_approval');

    expect(result.success).toBe(true);
  });

  describe('when the word belongs to an attempt', () => {
    it('should refuse it', () => {
      expect(improvementStatusSchema.safeParse('rejected').success).toBe(false);
    });
  });
});

describe('stepStatusSchema', () => {
  it('should hold every status a check can end in', () => {
    expect(stepStatusSchema.options).toEqual([
      'pending',
      'running',
      'passed',
      'failed',
      'skipped',
      'not_applicable',
      'error',
    ]);
  });
});

describe('checkNameSchema', () => {
  it('should name the seven checks of the quality gate', () => {
    expect(checkNameSchema.options).toHaveLength(7);
  });
});
