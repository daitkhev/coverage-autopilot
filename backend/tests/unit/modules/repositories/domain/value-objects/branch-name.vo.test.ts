import { describe, expect, it } from 'vitest';

import { InvalidBranchNameError } from '#repositories/domain/errors/invalid-branch-name.error';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';

describe('BranchName', () => {
  describe('create', () => {
    it.each(['main', 'coverage/src-a-ts', 'release-1.2', 'feature_x', 'ünï'])(
      'should keep the name %s',
      (name) => {
        expect(BranchName.create(name).value).toBe(name);
      },
    );

    it('should give the full name of the ref', () => {
      expect(BranchName.create('coverage/a').ref).toBe('refs/heads/coverage/a');
    });

    describe('when git would refuse the name', () => {
      it.each([
        ['an empty name', ''],
        ['a name that is too long', 'a'.repeat(256)],
        ['a space', 'my branch'],
        ['a control character', 'a\u0007b'],
        ['a tab', 'a\tb'],
        ['a delete character', 'a\u007fb'],
        ['a tilde', 'a~1'],
        ['a caret', 'a^'],
        ['a colon', 'a:b'],
        ['a question mark', 'a?'],
        ['a star', 'a*'],
        ['a bracket', 'a[b'],
        ['a backslash', 'a\\b'],
        ['a leading hyphen, read as an option', '--upload-pack=x'],
        ['a leading slash', '/main'],
        ['a trailing slash', 'main/'],
        ['a trailing dot', 'main.'],
        ['two dots', 'a..b'],
        ['two slashes', 'a//b'],
        ['an at and a brace', 'a@{1}'],
        ['an at alone', '@'],
        ['a part that starts with a dot', 'a/.hidden'],
        ['a leading dot', '.hidden'],
        ['a part that ends with .lock', 'a.lock/b'],
        ['a name that ends with .lock', 'main.lock'],
      ])('should throw InvalidBranchNameError for %s', (_case, name) => {
        expect(() => BranchName.create(name)).toThrow(InvalidBranchNameError);
      });
    });
  });

  describe('InvalidBranchNameError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidBranchNameError('x')).toMatchObject({
        name: 'InvalidBranchNameError',
        code: 'invalid_branch_name',
        retryable: false,
      });
    });
  });
});
