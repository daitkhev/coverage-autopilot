import type { MeasuredFileDto } from '#coverage/contracts/coverage-public-api';
import type { ImprovementSettings } from '#improvement/application/improvement-settings';
import { BudgetSettings } from '#improvement/domain/value-objects/budget-settings.vo';
import { FilePath } from '#kernel/primitives/file-path';
import {
  budgetOf,
  generatorOf,
  policyOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import { measuredTarget } from '#tests/support/verification-coverage';

/** The line of `src/price.ts` with a branch no test takes. */
const BRANCH_LINE = 12;

/** The settings of the improvement module in a test: a subscription. */
export const GENERATION_TEST_SETTINGS: ImprovementSettings = {
  budget: BudgetSettings.create({
    defaults: budgetOf(),
    maximums: budgetOf({ attempts: 10, minutes: 120 }),
  }),
  mode: 'automatic',
  policy: policyOf(),
  generator: generatorOf(),
  generation: { maxTurns: 12, maxCostUsd: null, timeoutMs: 600_000 },
  testFileSuffixes: ['.test.ts', '.test.tsx'],
  limitWaitMs: 3_600_000,
};

/** `src/price.ts` in the fresh snapshot, with what no test reaches. */
export function measuredPrice(): MeasuredFileDto {
  return {
    ...measuredTarget({ covered: 4, total: 10 }),
    path: FilePath.create(TARGET_FILE),
    uncoveredLines: [{ start: 3, end: 5 }],
    openBranchLines: [BRANCH_LINE],
    uncoveredFunctions: [{ name: 'discount', line: 3 }],
  };
}
