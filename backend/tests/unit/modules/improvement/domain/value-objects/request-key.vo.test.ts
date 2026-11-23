import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { RequestKey } from '#improvement/domain/value-objects/request-key.vo';

describe('RequestKey', () => {
  describe('create', () => {
    it.each(['a', 'Request_1-x', 'k'.repeat(128)])(
      'should keep the key "%s" as it was given',
      (key) => {
        expect(RequestKey.create(key).value).toBe(key);
      },
    );

    describe('when it needs escaping or is too long', () => {
      it.each(['', 'two words', 'key/1', 'k'.repeat(129)])(
        'should throw InvalidImprovementValueError for "%s"',
        (key) => {
          expect(() => RequestKey.create(key)).toThrow(
            new InvalidImprovementValueError(
              `"${key}" is not a request key: 1 to 128 letters, digits, ` +
                '"-" and "_".',
            ),
          );
        },
      );
    });
  });
});
