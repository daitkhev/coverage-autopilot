import { describe, expect, it } from 'vitest';

import { InvalidCommitShaError } from '#kernel/errors/invalid-commit-sha.error';
import { CommitSha } from '#kernel/primitives/commit-sha';

describe('CommitSha', () => {
  describe('create', () => {
    it.each(['0123456789abcdef'.repeat(4).slice(0, 40), 'f'.repeat(64)])(
      'should keep a full hash: %s',
      (hash) => {
        expect(CommitSha.create(hash).value).toBe(hash);
      },
    );

    it('should be equal to another made from the same hash', () => {
      const hash = 'a'.repeat(40);

      expect(CommitSha.create(hash).equals(CommitSha.create(hash))).toBe(true);
    });

    describe('when the text is not a full hash in lower case', () => {
      it.each(['abc1234', 'A'.repeat(40), 'g'.repeat(40), 'a'.repeat(41), ''])(
        'should throw InvalidCommitShaError for "%s"',
        (hash) => {
          expect(() => CommitSha.create(hash)).toThrow(InvalidCommitShaError);
        },
      );
    });
  });

  describe('InvalidCommitShaError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidCommitShaError('x')).toMatchObject({
        name: 'InvalidCommitShaError',
        code: 'invalid_commit_sha',
        retryable: false,
      });
    });
  });
});
