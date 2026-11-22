import { describe, expect, it } from 'vitest';

import { BudgetAboveMaximumError } from '#improvement/domain/errors/budget-above-maximum.error';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { Budget } from '#improvement/domain/value-objects/budget.vo';
import { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import { budgetOf } from '#tests/support/improvement-values';

/** The defaults and the maximums of the decisions: 3 of 10, 30 of 120. */
function settingsOf(tokens: { byDefault: number | null; most: number | null }) {
  return BudgetSettings.create({
    defaults: budgetOf({ attempts: 3, tokens: tokens.byDefault, minutes: 30 }),
    maximums: budgetOf({ attempts: 10, tokens: tokens.most, minutes: 120 }),
  });
}

const subscription = settingsOf({ byDefault: null, most: null });
const key = settingsOf({ byDefault: 200_000, most: 1_000_000 });

const limitsOf = (budget: Budget) => budget.limits;

describe('BudgetSettings', () => {
  describe('create', () => {
    it('should keep the defaults and the maximums', () => {
      expect(limitsOf(key.defaults)).toEqual({
        attempts: 3,
        tokens: 200_000,
        minutes: 30,
      });
      expect(limitsOf(key.maximums)).toEqual({
        attempts: 10,
        tokens: 1_000_000,
        minutes: 120,
      });
    });

    describe('when a default is not within its maximum', () => {
      it.each([
        ['attempts', { attempts: 11 }],
        ['tokens', { tokens: null }],
        ['minutes', { minutes: 121 }],
      ])('should throw InvalidImprovementValueError for %s', (limit, over) => {
        expect(() =>
          BudgetSettings.create({
            defaults: budgetOf({ tokens: 1, ...over }),
            maximums: budgetOf({ attempts: 10, tokens: 5, minutes: 120 }),
          }),
        ).toThrow(
          new InvalidImprovementValueError(
            `The default ${limit} is not within the maximum, or only one ` +
              'of them has a limit.',
          ),
        );
      });
    });
  });

  describe('fill', () => {
    it('should give the defaults to a request that asks for nothing', () => {
      expect(limitsOf(subscription.fill({}))).toEqual({
        attempts: 3,
        tokens: null,
        minutes: 30,
      });
    });

    it('should give the default of a limit a request gives as undefined', () => {
      expect(
        limitsOf(key.fill({ attempts: undefined, tokens: undefined })),
      ).toEqual({ attempts: 3, tokens: 200_000, minutes: 30 });
    });

    it('should keep what a request asks for within the maximums', () => {
      expect(
        limitsOf(key.fill({ attempts: 10, tokens: 1_000_000, minutes: 5 })),
      ).toEqual({ attempts: 10, tokens: 1_000_000, minutes: 5 });
    });

    describe('when a request asks for more than the maximum', () => {
      it('should throw BudgetAboveMaximumError', () => {
        expect(() => key.fill({ minutes: 121 })).toThrow(
          new BudgetAboveMaximumError(
            'The budget asks for 121 of minutes, and the service allows 120.',
          ),
        );
      });
    });

    describe('when a request asks for a limit of tokens with a subscription', () => {
      it('should throw BudgetAboveMaximumError', () => {
        expect(() => subscription.fill({ tokens: 500 })).toThrow(
          new BudgetAboveMaximumError(
            'The budget asks for 500 of tokens, and the service allows no ' +
              'limit.',
          ),
        );
      });
    });

    describe('when a request asks for no limit of tokens with a key', () => {
      it('should throw BudgetAboveMaximumError', () => {
        expect(() => key.fill({ tokens: null })).toThrow(
          BudgetAboveMaximumError,
        );
      });
    });

    describe('when a request asks for a limit that is not one', () => {
      it('should throw InvalidImprovementValueError', () => {
        expect(() => key.fill({ attempts: 0 })).toThrow(
          InvalidImprovementValueError,
        );
      });
    });
  });

  describe('BudgetAboveMaximumError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new BudgetAboveMaximumError('x')).toMatchObject({
        name: 'BudgetAboveMaximumError',
        code: 'budget_above_maximum',
        retryable: false,
      });
    });
  });
});
