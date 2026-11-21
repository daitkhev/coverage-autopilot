import { describe, expect, it } from 'vitest';

import {
  REQUEST_KEY_HEADER,
  requestKeySchema,
} from '#api-contracts/request-key';

describe('REQUEST_KEY_HEADER', () => {
  it('should name the header of the design', () => {
    expect(REQUEST_KEY_HEADER).toBe('Idempotency-Key');
  });
});

describe('requestKeySchema', () => {
  it.each([['9b2f6c1e-3d4a-4f5b-8c7d-0e1f2a3b4c5d'], ['scan_r1_01']])(
    'should accept %s',
    (value) => {
      expect(requestKeySchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ['an empty key', ''],
    ['a key that is too long', 'k'.repeat(129)],
    ['a key with a space', 'two words'],
    ['a key with a line break', 'a\nb'],
  ])('should refuse %s', (_name, value) => {
    expect(requestKeySchema.safeParse(value).success).toBe(false);
  });
});
