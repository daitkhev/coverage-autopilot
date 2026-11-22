import { describe, expect, it } from 'vitest';

import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';

import { largerLimits, type Limits } from '#components/start-limits';
import { BUDGET_SETTINGS } from '#tests/support/sample-repositories';

/** A key paid for, so tokens have a limit of their own. */
const PAID_SETTINGS: BudgetSettings = {
  defaults: { attempts: 3, tokens: 200_000, minutes: 30 },
  maximums: { attempts: 6, tokens: 600_000, minutes: 60 },
};

describe('largerLimits', () => {
  it('should raise every limit by one step and keep how it is published', () => {
    const earlier: Limits = {
      attempts: 3,
      tokens: 200_000,
      minutes: 30,
      mode: 'automatic',
    };

    expect(largerLimits(earlier, PAID_SETTINGS)).toEqual({
      attempts: 4,
      tokens: 210_000,
      minutes: 35,
      mode: 'automatic',
    });
  });

  it('should keep a limit that is at its maximum', () => {
    const earlier: Limits = {
      attempts: 6,
      tokens: 600_000,
      minutes: 60,
      mode: 'review',
    };

    expect(largerLimits(earlier, PAID_SETTINGS)).toEqual(earlier);
  });

  it('should leave tokens without a limit under a subscription', () => {
    const earlier: Limits = {
      attempts: 3,
      tokens: null,
      minutes: 30,
      mode: 'review',
    };

    expect(largerLimits(earlier, BUDGET_SETTINGS)).toEqual({
      attempts: 4,
      tokens: null,
      minutes: 35,
      mode: 'review',
    });
  });
});
