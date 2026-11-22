import type { Type } from '@nestjs/common';

import { ApproveImprovementHandler } from '#improvement/application/commands/approve-improvement/approve-improvement.handler';
import { CancelImprovementHandler } from '#improvement/application/commands/cancel-improvement/cancel-improvement.handler';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import { GetBudgetSettingsHandler } from '#improvement/application/queries/get-budget-settings/get-budget-settings.handler';
import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { GetImprovementPatchHandler } from '#improvement/application/queries/get-improvement-patch/get-improvement-patch.handler';
import { ListImprovementsHandler } from '#improvement/application/queries/list-improvements/list-improvements.handler';
import { AnswerStatus } from '#improvement/infrastructure/http/answer-status';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import type { ImprovementRequestWorld } from '#tests/support/improvement-request-world';

/** The header of the key the requests of the journeys are made under. */
export const FIRST_KEY = { 'Idempotency-Key': 'request-1' } as const;

/**
 * Routes of improvements on a socket, over the real handlers of a world
 * in memory, so a test sets what lies below and reads what was asked.
 */
export async function improvementRoutes(
  world: ImprovementRequestWorld,
  controller: Type,
): Promise<HttpService> {
  return startHttpService({
    controllers: [controller],
    providers: [
      AnswerStatus,
      { provide: StartImprovementHandler, useValue: world.start },
      { provide: ApproveImprovementHandler, useValue: world.approve },
      { provide: CancelImprovementHandler, useValue: world.cancel },
      { provide: GetImprovementHandler, useValue: world.getImprovement },
      { provide: ListImprovementsHandler, useValue: world.listImprovements },
      { provide: GetImprovementPatchHandler, useValue: world.getPatch },
      { provide: GetBudgetSettingsHandler, useValue: world.getBudgetSettings },
    ],
  });
}
