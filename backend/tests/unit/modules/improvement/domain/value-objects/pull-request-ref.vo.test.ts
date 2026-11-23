import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';

const URL_OF_7 = 'https://github.com/acme/shop/pull/7';

describe('PullRequestRef', () => {
  describe('create', () => {
    it('should keep the number and the address', () => {
      const pullRequest = PullRequestRef.create({ number: 7, url: URL_OF_7 });

      expect(pullRequest.number).toBe(7);
      expect(pullRequest.url).toBe(URL_OF_7);
    });

    describe('when the number or the address is not one', () => {
      it.each([
        { number: 0, url: URL_OF_7 },
        { number: 1.5, url: URL_OF_7 },
        { number: 7, url: 'pull 7' },
      ])('should throw InvalidImprovementValueError for %o', (props) => {
        expect(() => PullRequestRef.create(props)).toThrow(
          new InvalidImprovementValueError(
            `#${String(props.number)} at "${props.url}" is not a pull ` +
              'request: a number from 1 and an address.',
          ),
        );
      });
    });
  });
});
