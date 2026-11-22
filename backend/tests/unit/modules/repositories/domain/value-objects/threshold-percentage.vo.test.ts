import { describe, expect, it } from 'vitest';

import { InvalidThresholdPercentageError } from '#repositories/domain/errors/invalid-threshold-percentage.error';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';

describe('ThresholdPercentage', () => {
  describe('create', () => {
    it.each([1, 95, 100])('should keep %d', (value) => {
      expect(ThresholdPercentage.create(value).value).toBe(value);
    });

    describe('when the number is no whole percent from 1 to 100', () => {
      it.each([
        ['nothing at all', 0],
        ['less than nothing', -5],
        ['more than everything', 101],
        ['a fraction', 85.5],
        ['not a number', Number.NaN],
      ])(
        'should throw InvalidThresholdPercentageError for %s',
        (_case, value) => {
          expect(() => ThresholdPercentage.create(value)).toThrow(
            InvalidThresholdPercentageError,
          );
        },
      );

      it('should say what a threshold is', () => {
        expect(() => ThresholdPercentage.create(101)).toThrow(
          '101 is not a threshold: it is a whole percent from 1 to 100.',
        );
      });
    });
  });

  describe('InvalidThresholdPercentageError', () => {
    it('should be a rule of the domain that no try changes', () => {
      expect(new InvalidThresholdPercentageError('x')).toMatchObject({
        name: 'InvalidThresholdPercentageError',
        code: 'invalid_threshold_percentage',
        retryable: false,
      });
    });
  });
});
