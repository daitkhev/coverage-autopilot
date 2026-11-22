import { describe, expect, it } from 'vitest';

import { GetBudgetSettingsHandler } from '#improvement/application/queries/get-budget-settings/get-budget-settings.handler';
import { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import { budgetOf, TEST_SETTINGS } from '#tests/support/improvement-values';

describe('GetBudgetSettingsHandler', () => {
  describe('execute', () => {
    it('should give the defaults and the maximums of the service as numbers', () => {
      const handler = new GetBudgetSettingsHandler(TEST_SETTINGS);

      expect(handler.execute()).toEqual({
        defaults: { attempts: 3, tokens: null, minutes: 30 },
        maximums: { attempts: 10, tokens: null, minutes: 120 },
      });
    });

    describe('when the service pays the generator by a key', () => {
      it('should give the limits of tokens too', () => {
        const handler = new GetBudgetSettingsHandler({
          ...TEST_SETTINGS,
          budget: BudgetSettings.create({
            defaults: budgetOf({ tokens: 200_000 }),
            maximums: budgetOf({ attempts: 10, tokens: 1_000_000 }),
          }),
        });

        expect(handler.execute()).toEqual({
          defaults: { attempts: 3, tokens: 200_000, minutes: 30 },
          maximums: { attempts: 10, tokens: 1_000_000, minutes: 30 },
        });
      });
    });
  });
});
