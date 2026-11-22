import type { CoverageCounters } from '@coverage-autopilot/api-contracts/coverage';
import type {
  MeasuredFile,
  NoCodeFile,
  SnapshotFiles,
  UnmeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';
import type { UnmeasuredReason } from '@coverage-autopilot/api-contracts/statuses';

import { PAYMENTS_SNAPSHOT } from '#tests/support/sample-repositories';

/** A range of lines the tests miss, and the branch that leads into it. */
interface Gap {
  readonly start: number;
  readonly end: number;
  readonly branch: number;
}

/** The uncovered lines and the open branches of a file, from its gaps. */
function gapsOf(
  gaps: readonly Gap[],
): Pick<MeasuredFile, 'uncoveredLines' | 'openBranchLines'> {
  return {
    uncoveredLines: gaps.map(({ start, end }) => ({ start, end })),
    openBranchLines: gaps.map((gap) => gap.branch),
  };
}

/** What `src/billing/invoice.ts` measured before any new test: 41.2%. */
export const INVOICE_COVERAGE: CoverageCounters = {
  statements: { covered: 23, total: 57, percentage: 40.4 },
  branches: { covered: 2, total: 8, percentage: 25 },
  functions: { covered: 3, total: 6, percentage: 50 },
  lines: { covered: 21, total: 51, percentage: 41.2 },
};

/** Below the threshold, with what exactly is not covered. Never improved. */
export const BELOW_THRESHOLD_FILE: MeasuredFile = {
  path: 'src/billing/invoice.ts',
  state: 'measured',
  coverage: INVOICE_COVERAGE,
  belowThreshold: true,
  ...gapsOf([
    { start: 18, end: 31, branch: 19 },
    { start: 44, end: 44, branch: 44 },
    { start: 52, end: 67, branch: 58 },
  ]),
  uncoveredFunctions: [
    { name: 'applyDiscount', line: 18 },
    { name: 'roundToCents', line: 52 },
    { name: 'formatTotal', line: 60 },
  ],
  latestImprovement: null,
};

/** At or above the threshold on every counter. */
export const ABOVE_THRESHOLD_FILE: MeasuredFile = {
  path: 'src/billing/currency.ts',
  state: 'measured',
  coverage: {
    statements: { covered: 46, total: 50, percentage: 92 },
    branches: { covered: 9, total: 10, percentage: 90 },
    functions: { covered: 5, total: 5, percentage: 100 },
    lines: { covered: 44, total: 48, percentage: 91.7 },
  },
  belowThreshold: false,
  ...gapsOf([{ start: 37, end: 40, branch: 38 }]),
  uncoveredFunctions: [],
  latestImprovement: null,
};

/** Types alone: `0/0` and no code, never a target. */
export const NO_CODE_FILE: NoCodeFile = {
  path: 'src/billing/types.ts',
  state: 'no_executable_code',
};

/** A file the scan could not measure, one for each reason. */
export const UNMEASURED_FILES: Readonly<
  Record<UnmeasuredReason, UnmeasuredFile>
> = {
  parse_failed: {
    path: 'src/legacy/parser.ts',
    state: 'unmeasured',
    reason: 'parse_failed',
    toolMessage: "src/legacy/parser.ts:212:14 ')' expected.",
  },
  missing_from_report: {
    path: 'src/api/schema.ts',
    state: 'unmeasured',
    reason: 'missing_from_report',
    toolMessage: null,
  },
  no_counters: {
    path: 'src/api/webhook.ts',
    state: 'unmeasured',
    reason: 'no_counters',
    toolMessage: null,
  },
};

/**
 * Below the threshold, and its latest improvement waits for approval:
 * the one under `awaiting_approval` of `IMPROVEMENT_BY_STATUS`.
 */
export const IMPROVED_FILE: MeasuredFile = {
  ...BELOW_THRESHOLD_FILE,
  path: 'src/billing/sum.ts',
  coverage: {
    statements: { covered: 30, total: 41, percentage: 73.2 },
    branches: { covered: 3, total: 4, percentage: 75 },
    functions: { covered: 4, total: 5, percentage: 80 },
    lines: { covered: 29, total: 38, percentage: 76.3 },
  },
  ...gapsOf([{ start: 27, end: 35, branch: 28 }]),
  uncoveredFunctions: [{ name: 'sumTaxes', line: 27 }],
  latestImprovement: { id: 'improvement-sum', status: 'awaiting_approval' },
};

/** The files of the latest snapshot of `example/payments`, in each state. */
export const PAYMENTS_FILES: SnapshotFiles = {
  snapshotId: PAYMENTS_SNAPSHOT.id,
  threshold: PAYMENTS_SNAPSHOT.threshold,
  items: [
    BELOW_THRESHOLD_FILE,
    IMPROVED_FILE,
    ABOVE_THRESHOLD_FILE,
    NO_CODE_FILE,
    ...Object.values(UNMEASURED_FILES),
  ],
};
