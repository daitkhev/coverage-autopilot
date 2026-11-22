import { Controller, Get, Inject } from '@nestjs/common';

import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';

import { GetBudgetSettingsHandler } from '#improvement/application/queries/get-budget-settings/get-budget-settings.handler';

/**
 * The defaults and the maximums of a budget, so the dialog that starts an
 * improvement holds no number of its own. They are already in the words
 * of the contract.
 */
@Controller('settings')
export class BudgetSettingsController {
  private readonly settings: GetBudgetSettingsHandler;

  public constructor(
    @Inject(GetBudgetSettingsHandler) settings: GetBudgetSettingsHandler,
  ) {
    this.settings = settings;
  }

  @Get('budget')
  public budget(): BudgetSettings {
    return this.settings.execute();
  }
}
