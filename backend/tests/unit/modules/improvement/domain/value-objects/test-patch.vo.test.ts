import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import { hashOf } from '#tests/support/improvement-values';

const TEXT = 'diff --git a/src/a.test.ts b/src/a.test.ts\n';

describe('TestPatch', () => {
  describe('create', () => {
    it('should keep the text and the hash it was given', () => {
      const patch = TestPatch.create({ text: TEXT, hash: hashOf('1') });

      expect(patch.text).toBe(TEXT);
      expect(patch.hash).toBe(hashOf('1'));
    });

    describe('when it has no text or no SHA-256 hash in lower-case hex', () => {
      it.each([
        { text: '', hash: hashOf('1') },
        { text: TEXT, hash: hashOf('A') },
        { text: TEXT, hash: 'a'.repeat(40) },
      ])('should throw InvalidImprovementValueError for %o', (props) => {
        expect(() => TestPatch.create(props)).toThrow(
          new InvalidImprovementValueError(
            'A patch has a text and a SHA-256 hash in lower-case hex, and ' +
              `"${props.hash}" names a patch of ${String(props.text.length)} ` +
              'characters.',
          ),
        );
      });
    });
  });
});
