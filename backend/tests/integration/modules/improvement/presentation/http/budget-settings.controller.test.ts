import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { budgetSettingsSchema } from '@coverage-autopilot/api-contracts/improvements';

import { BudgetSettingsController } from '#improvement/presentation/http/budget-settings.controller';
import type { HttpService } from '#tests/support/http-service';
import { ImprovementRequestWorld } from '#tests/support/improvement-request-world';
import { improvementRoutes } from '#tests/support/improvement-routes';

let service: HttpService;

beforeEach(async () => {
  service = await improvementRoutes(
    new ImprovementRequestWorld(),
    BudgetSettingsController,
  );
});

afterEach(async () => {
  await service.close();
});

describe('BudgetSettingsController', () => {
  describe('GET /settings/budget', () => {
    it('should answer 200 with the defaults and the maximums of the settings', async () => {
      const answer = await service.send('GET', '/settings/budget');

      expect(answer.status).toBe(200);
      expect(budgetSettingsSchema.parse(answer.body)).toEqual({
        defaults: { attempts: 3, tokens: null, minutes: 30 },
        maximums: { attempts: 10, tokens: null, minutes: 120 },
      });
    });
  });
});
