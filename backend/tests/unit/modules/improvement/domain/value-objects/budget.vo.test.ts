import { describe, expect, it } from 'vitest';

import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { Budget } from '#improvement/domain/value-objects/budget.vo';
import { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import { budgetOf, minutesIn } from '#tests/support/improvement-values';

const usage = (attempts: number, tokens: number, seconds: number) =>
  BudgetUsage.create({ attempts, tokens, seconds });

describe('Budget', () => {
  describe('create', () => {
    it('should keep the three limits', () => {
      const budget = Budget.create({ attempts: 3, tokens: 5000, minutes: 30 });

      expect(budget.limits).toEqual({ attempts: 3, tokens: 5000, minutes: 30 });
      expect([budget.attempts, budget.tokens, budget.minutes]).toEqual([
        3, 5000, 30,
      ]);
    });

    it('should keep no limit of tokens, as under a subscription', () => {
      expect(budgetOf({ tokens: null }).tokens).toBeNull();
    });

    describe('when a limit is not a whole number from 1', () => {
      it.each([
        { attempts: 0, tokens: null, minutes: 30 },
        { attempts: 3, tokens: 0, minutes: 30 },
        { attempts: 3, tokens: null, minutes: 0.5 },
        { attempts: -1, tokens: null, minutes: 30 },
      ])('should throw InvalidImprovementValueError for %o', (limits) => {
        expect(() => Budget.create(limits)).toThrow(
          InvalidImprovementValueError,
        );
      });

      it('should say which limits it was given', () => {
        expect(() =>
          Budget.create({ attempts: 0, tokens: null, minutes: 30 }),
        ).toThrow(
          new InvalidImprovementValueError(
            '0 attempts, null tokens and 30 minutes are not a budget: each ' +
              'is a whole number from 1, and only tokens may have no limit.',
          ),
        );
      });
    });
  });

  describe('deadlineFrom', () => {
    it('should put the deadline the limit of minutes after the start', () => {
      expect(budgetOf({ minutes: 30 }).deadlineFrom(minutesIn(1))).toEqual(
        minutesIn(31),
      );
    });
  });

  describe('postpone', () => {
    it('should move the deadline later by the length of the wait', () => {
      expect(
        Budget.postpone(minutesIn(31), minutesIn(5), minutesIn(65)),
      ).toEqual(minutesIn(91));
    });

    it('should not move it earlier when the clock went back', () => {
      expect(
        Budget.postpone(minutesIn(31), minutesIn(5), minutesIn(4)),
      ).toEqual(minutesIn(31));
    });
  });

  describe('secondsUsed', () => {
    const budget = budgetOf({ minutes: 30 });

    it('should count nothing before work starts', () => {
      expect(budget.secondsUsed(null, minutesIn(10))).toBe(0);
    });

    it('should count the limit less the time left to the deadline', () => {
      expect(budget.secondsUsed(minutesIn(31), minutesIn(11))).toBe(600);
    });

    it('should count whole seconds', () => {
      const end = minutesIn(11).plusMilliseconds(999);

      expect(budget.secondsUsed(minutesIn(31), end)).toBe(600);
    });

    it('should count past the limit once the deadline has passed', () => {
      expect(budget.secondsUsed(minutesIn(31), minutesIn(32))).toBe(1860);
    });

    it('should count nothing for an end before the work began', () => {
      expect(budget.secondsUsed(minutesIn(31), minutesIn(0))).toBe(0);
    });
  });

  describe('spentLimit', () => {
    const budget = Budget.create({ attempts: 3, tokens: 5000, minutes: 30 });

    it('should name no limit while each has some left', () => {
      expect(budget.spentLimit(usage(2, 4999, 1799))).toBeNull();
    });

    it.each([
      ['attempts', usage(3, 0, 0)],
      ['tokens', usage(0, 5000, 0)],
      ['minutes', usage(0, 0, 1800)],
    ])('should name %s once they are spent', (limit, used) => {
      expect(budget.spentLimit(used)).toBe(limit);
    });

    it('should never spend tokens that have no limit', () => {
      expect(
        budgetOf({ tokens: null }).spentLimit(usage(0, 10 ** 9, 0)),
      ).toBeNull();
    });
  });
});
