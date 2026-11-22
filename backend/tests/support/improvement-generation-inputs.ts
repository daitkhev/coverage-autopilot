import type { MeasuredFileDto } from '#coverage/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import { TARGET_FILE } from '#tests/support/improvement-values';
import { measuredTarget } from '#tests/support/verification-coverage';

/** The line of `src/price.ts` with a branch no test takes. */
const BRANCH_LINE = 12;

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
