import { Inject, Injectable } from '@nestjs/common';

import type { BudgetSettingsDto } from '#improvement/application/dto/improvement.dto';
import { budgetDtoOf } from '#improvement/application/dto/improvement-dto-mapping';
import {
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';

/**
 * The defaults and the maximums of a budget, so the dialog that starts an
 * improvement holds no number of its own.
 */
@Injectable()
export class GetBudgetSettingsHandler {
  private readonly settings: ImprovementSettings;

  public constructor(
    @Inject(IMPROVEMENT_SETTINGS) settings: ImprovementSettings,
  ) {
    this.settings = settings;
  }

  public execute(): BudgetSettingsDto {
    const { defaults, maximums } = this.settings.budget;
    return {
      defaults: budgetDtoOf(defaults),
      maximums: budgetDtoOf(maximums),
    };
  }
}
