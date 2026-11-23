import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';

const ID = '0d5f0f3e-8a2b-4c1d-9e7f-1a2b3c4d5e6f';

describe('ImprovementId', () => {
  describe('create', () => {
    it('should keep a UUID in lower case', () => {
      expect(ImprovementId.create(ID).value).toBe(ID);
    });

    it('should be equal to an id of the same text', () => {
      expect(ImprovementId.create(ID).equals(ImprovementId.create(ID))).toBe(
        true,
      );
    });

    describe('when the text is not a UUID in lower case', () => {
      it.each(['', ID.toUpperCase(), `${ID}0`, 'improvement-1'])(
        'should throw InvalidImprovementValueError for "%s"',
        (text) => {
          expect(() => ImprovementId.create(text)).toThrow(
            new InvalidImprovementValueError(
              `"${text}" is not the id of an improvement: a UUID in lower case.`,
            ),
          );
        },
      );
    });
  });

  describe('InvalidImprovementValueError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidImprovementValueError('x')).toMatchObject({
        name: 'InvalidImprovementValueError',
        code: 'invalid_improvement_value',
        retryable: false,
      });
    });
  });
});
