import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  REQUEST_HASHER,
  type RequestHasher,
} from '#improvement/application/ports/request-hasher.port';
import { TEST_GENERATOR } from '#improvement/application/ports/test-generator.port';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';

describe('RequestHasher', () => {
  it('should be injected by a token of its own', () => {
    expect(REQUEST_HASHER.description).toBe('RequestHasher');
    expect(REQUEST_HASHER).not.toBe(TEST_GENERATOR);
  });

  it('should turn a canonical text into a fingerprint the domain checked', () => {
    expectTypeOf<RequestHasher['fingerprintOf']>()
      .parameter(0)
      .toEqualTypeOf<string>();
    expectTypeOf<
      RequestHasher['fingerprintOf']
    >().returns.toEqualTypeOf<RequestFingerprint>();
  });
});
