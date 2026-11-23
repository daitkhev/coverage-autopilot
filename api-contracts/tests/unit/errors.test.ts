import { describe, expect, it } from 'vitest';

import { errorSchema } from '#api-contracts/errors';

describe('errorSchema', () => {
  it.each([
    ['a conflict', { error: 'stale_snapshot', message: 'The file changed.' }],
    [
      'a failure printed by the client',
      { error: 'budget_exhausted', message: '3 attempts were rejected.' },
    ],
    ['a failed scan', { error: 'install_failed', message: 'npm ci exited 1.' }],
    [
      'a conflict with earlier work',
      {
        error: 'work_already_requested',
        message: 'Requested before.',
        improvementId: 'i1',
      },
    ],
  ])('should accept %s', (_name, value) => {
    expect(errorSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['an unknown code', { error: 'teapot', message: 'x' }],
    ['a missing message', { error: 'not_found' }],
    ['an empty message', { error: 'not_found', message: '' }],
    ['an unknown key', { error: 'not_found', message: 'x', stack: 'at y' }],
  ])('should refuse %s', (_name, value) => {
    expect(errorSchema.safeParse(value).success).toBe(false);
  });
});
