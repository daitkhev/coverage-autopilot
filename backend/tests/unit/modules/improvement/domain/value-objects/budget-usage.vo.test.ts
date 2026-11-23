import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';

describe('BudgetUsage', () => {
  describe('create', () => {
    it('should keep what was spent', () => {
      const usage = BudgetUsage.create({ attempts: 1, tokens: 2, seconds: 3 });

      expect([usage.attempts, usage.tokens, usage.seconds]).toEqual([1, 2, 3]);
    });

    describe('when a count is not a whole number from 0', () => {
      it.each([
        [-1, 0, 0],
        [0, 0.5, 0],
        [0, 0, -2],
      ])(
        'should throw InvalidImprovementValueError for %s, %s and %s',
        (attempts, tokens, seconds) => {
          expect(() =>
            BudgetUsage.create({ attempts, tokens, seconds }),
          ).toThrow(
            new InvalidImprovementValueError(
              `${String(attempts)}, ${String(tokens)}, ${String(seconds)} ` +
                'is not a usage of a budget: each is a whole number from 0.',
            ),
          );
        },
      );
    });
  });
});
