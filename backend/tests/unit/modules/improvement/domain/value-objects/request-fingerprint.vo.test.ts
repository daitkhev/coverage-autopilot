import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { hashOf } from '#tests/support/improvement-values';

describe('RequestFingerprint', () => {
  describe('create', () => {
    it('should keep the hash it was given', () => {
      expect(RequestFingerprint.create(hashOf('9')).value).toBe(hashOf('9'));
    });

    describe('when it is not a SHA-256 hash in lower-case hex', () => {
      it.each([hashOf('F'), 'f'.repeat(63), ''])(
        'should throw InvalidImprovementValueError for "%s"',
        (text) => {
          expect(() => RequestFingerprint.create(text)).toThrow(
            new InvalidImprovementValueError(
              `"${text}" is not a request fingerprint: a SHA-256 hash in ` +
                'lower-case hex.',
            ),
          );
        },
      );
    });
  });
});
