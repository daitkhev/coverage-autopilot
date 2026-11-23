import { describe, expect, it } from 'vitest';

import { InvalidRepositoryUrlError } from '#repositories/domain/errors/invalid-repository-url.error';
import {
  NOT_A_REPOSITORY_URL,
  RepositoryUrl,
} from '#repositories/domain/value-objects/repository-url.vo';

describe('RepositoryUrl', () => {
  describe('parse', () => {
    it.each([
      'https://github.com/acme/widgets',
      'https://github.com/acme/widgets.git',
      'https://github.com/acme/widgets/',
      'https://GitHub.com/acme/widgets.git/',
    ])('should read the owner and the name of %s', (text) => {
      const url = RepositoryUrl.parse(text);

      expect(url.owner).toBe('acme');
      expect(url.name).toBe('widgets');
      expect(url.fullName).toBe('acme/widgets');
      expect(url.value).toBe('https://github.com/acme/widgets');
      expect(url.host).toBe('github.com');
    });

    it('should keep the case of the owner and the name', () => {
      const url = RepositoryUrl.parse('https://github.com/Acme-Labs/My.Repo_2');

      expect(url.fullName).toBe('Acme-Labs/My.Repo_2');
    });

    it('should be equal to another address of the same repository', () => {
      expect(
        RepositoryUrl.parse('https://github.com/acme/widgets.git').equals(
          RepositoryUrl.parse('https://github.com/acme/widgets'),
        ),
      ).toBe(true);
    });

    describe('when the text is not an address of a repository', () => {
      it.each([
        ['not an address', 'acme/widgets'],
        ['another scheme', 'http://github.com/acme/widgets'],
        ['the address of git over SSH', 'git@github.com:acme/widgets.git'],
        ['another host', 'https://gitlab.com/acme/widgets'],
        ['a credential', 'https://token@github.com/acme/widgets'],
        ['a port', 'https://github.com:8443/acme/widgets'],
        ['a query', 'https://github.com/acme/widgets?tab=readme'],
        ['a fragment', 'https://github.com/acme/widgets#readme'],
        ['an owner alone', 'https://github.com/acme'],
        ['a deeper path', 'https://github.com/acme/widgets/tree/main'],
        ['an owner with a leading hyphen', 'https://github.com/-acme/widgets'],
        ['an owner with two hyphens', 'https://github.com/ac--me/widgets'],
        ['a name of dots', 'https://github.com/acme/..'],
        ['a name that is only the suffix', 'https://github.com/acme/.git'],
        ['an escaped character', 'https://github.com/acme/wid%20gets'],
      ])('should throw InvalidRepositoryUrlError for %s', (_case, text) => {
        expect(() => RepositoryUrl.parse(text)).toThrow(
          InvalidRepositoryUrlError,
        );
      });
    });
  });

  describe('read', () => {
    it('should give the address of a repository', () => {
      expect(
        RepositoryUrl.read('https://github.com/acme/shop.git')?.value,
      ).toBe('https://github.com/acme/shop');
    });

    describe('when the text is not an address of a repository', () => {
      it('should give null', () => {
        expect(RepositoryUrl.read('https://gitlab.com/acme/shop')).toBeNull();
      });
    });
  });

  describe('NOT_A_REPOSITORY_URL', () => {
    it('should say what an address is, with an example', () => {
      expect(NOT_A_REPOSITORY_URL).toBe(
        'The address is not the HTTPS address of a repository on ' +
          'github.com, such as https://github.com/acme/shop.',
      );
    });
  });

  describe('InvalidRepositoryUrlError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidRepositoryUrlError('x')).toMatchObject({
        name: 'InvalidRepositoryUrlError',
        code: 'invalid_repository_url',
        retryable: false,
      });
    });
  });
});
