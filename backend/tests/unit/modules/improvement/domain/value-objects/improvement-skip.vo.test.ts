import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  ImprovementSkip,
  SKIP_REASONS,
  type SkipReason,
} from '#improvement/domain/value-objects/improvement-skip.vo';

describe('ImprovementSkip', () => {
  it('should know the reasons of the contract', () => {
    expect(SKIP_REASONS).toEqual(['threshold_met', 'no_undetected_mutants']);
  });

  describe('create', () => {
    it('should keep the reason and the sentence', () => {
      const skip = ImprovementSkip.create({
        reason: 'no_undetected_mutants',
        message: 'Every mutant is detected already.',
      });

      expect([skip.reason, skip.message]).toEqual([
        'no_undetected_mutants',
        'Every mutant is detected already.',
      ]);
    });

    describe('when the reason is unknown or there is no sentence', () => {
      it.each([
        ['stale_snapshot', 'The file changed.'],
        ['threshold_met', ''],
      ])(
        'should throw InvalidImprovementValueError for %s',
        (reason, message) => {
          expect(() =>
            ImprovementSkip.create({ reason: reason as SkipReason, message }),
          ).toThrow(
            new InvalidImprovementValueError(
              `"${reason}" with "${message}" is not a skip: a known reason ` +
                'and a sentence.',
            ),
          );
        },
      );
    });
  });
});
