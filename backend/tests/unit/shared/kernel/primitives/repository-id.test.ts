import { describe, expect, it } from 'vitest';

import { DomainError } from '#kernel/errors/domain.error';
import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { RepositoryId } from '#kernel/primitives/repository-id';

const ID = '5f0c3b9e-7d1a-4c2b-9e8f-0a1b2c3d4e5f';

describe('RepositoryId', () => {
  describe('create', () => {
    it('should keep a UUID in lower case', () => {
      expect(RepositoryId.create(ID).value).toBe(ID);
    });

    describe('when the text is not a UUID in lower case', () => {
      it.each([ID.toUpperCase(), 'repo-1', `${ID}0`, ''])(
        'should throw InvalidRepositoryIdError for "%s"',
        (text) => {
          expect(() => RepositoryId.create(text)).toThrow(
            new InvalidRepositoryIdError(
              `"${text}" is not a repository id: a UUID in lower case.`,
            ),
          );
        },
      );
    });
  });

  describe('InvalidRepositoryIdError', () => {
    it('should be a fault of the domain that is not retried', () => {
      const error = new InvalidRepositoryIdError('x');

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        name: 'InvalidRepositoryIdError',
        code: 'invalid_repository_id',
        retryable: false,
      });
    });
  });
});
