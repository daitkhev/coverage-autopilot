import type {
  Improvement,
  ImprovementList,
  ImprovementPatch,
} from '@coverage-autopilot/api-contracts/improvements';
import {
  checkNameSchema,
  type ImprovementStatus,
} from '@coverage-autopilot/api-contracts/statuses';

import type { Narrowing } from '#screens/improvements/improvement-filters';
import {
  ACCEPTED_ATTEMPT,
  ACCEPTED_HASH,
  OPEN_ATTEMPT,
  REJECTED_ATTEMPT,
} from '#tests/support/sample-attempts';
import {
  PAYMENTS_COMMIT,
  PAYMENTS_SNAPSHOT,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

/** Waits for its turn, behind the work of its repository. */
const CREATED: Improvement = {
  id: 'improvement-refund',
  repositoryId: SCANNED_REPOSITORY.id,
  sourceSnapshotId: PAYMENTS_SNAPSHOT.id,
  baselineSnapshotId: null,
  baseCommit: PAYMENTS_COMMIT,
  targetFile: 'src/api/refund.ts',
  status: 'created',
  mode: 'automatic',
  waitingFor: 'repository',
  phaseStartedAt: null,
  budget: { attempts: 3, tokens: null, minutes: 30 },
  usage: { attempts: 0, tokens: 0, seconds: 0 },
  deadlineAt: null,
  resumesAt: null,
  limitWaits: 0,
  qualityPolicy: {
    requiredChecks: checkNameSchema.options,
    repeatedRuns: 3,
    mutationThreshold: 50,
  },
  generator: {
    cli: 'claude_code',
    model: 'example-model',
    promptVersion: '1',
    billing: 'subscription',
  },
  attempts: [],
  progress: null,
  branch: null,
  pullRequest: null,
  failure: null,
  skip: null,
  createdAt: '2026-11-21T14:04:30.000Z',
  updatedAt: '2026-11-21T14:04:30.000Z',
  cancelledAt: null,
};

/** Started at 13:50, so 15 of its 30 minutes are spent at 14:05. */
const WORKING: Improvement = {
  ...CREATED,
  waitingFor: null,
  phaseStartedAt: '2026-11-21T13:56:10.000Z',
  usage: { attempts: 1, tokens: 41_000, seconds: 660 },
  deadlineAt: '2026-11-21T14:20:00.000Z',
  baselineSnapshotId: 'snapshot-payments-3',
  attempts: [REJECTED_ATTEMPT],
  createdAt: '2026-11-21T13:50:00.000Z',
  updatedAt: '2026-11-21T14:04:59.000Z',
};

const STEPS_WRITTEN_AT = '2026-11-21T14:04:59.000Z';
const CANCELLED_AT = '2026-11-21T14:01:00.000Z';

/** An improvement in each status, under the name of its status. */
export const IMPROVEMENT_BY_STATUS: Readonly<
  Record<ImprovementStatus, Improvement>
> = {
  created: CREATED,
  analyzing: {
    ...WORKING,
    id: 'improvement-entries',
    targetFile: 'src/ledger/entries.ts',
    status: 'analyzing',
    phaseStartedAt: '2026-11-21T14:04:00.000Z',
    usage: { attempts: 0, tokens: 0, seconds: 60 },
    baselineSnapshotId: null,
    attempts: [],
    progress: {
      steps: [
        { code: 'revision_check', status: 'passed' },
        { code: 'fresh_snapshot', status: 'passed' },
        { code: 'prepare', status: 'passed' },
        { code: 'type_check', status: 'running' },
        { code: 'existing_tests', status: 'pending' },
        { code: 'mutation_baseline', status: 'pending' },
      ],
      updatedAt: STEPS_WRITTEN_AT,
    },
  },
  generating: {
    ...WORKING,
    id: 'improvement-tax',
    targetFile: 'src/billing/tax.ts',
    status: 'generating',
    usage: { attempts: 2, tokens: 41_000, seconds: 540 },
    attempts: [REJECTED_ATTEMPT, OPEN_ATTEMPT],
    // The generator reports no steps: the attempt is what shows.
    progress: { steps: [], updatedAt: STEPS_WRITTEN_AT },
  },
  waiting_for_limit: {
    ...WORKING,
    id: 'improvement-discount',
    targetFile: 'src/billing/discount.ts',
    status: 'waiting_for_limit',
    waitingFor: 'limit',
    resumesAt: '2026-11-21T16:00:00.000Z',
    limitWaits: 1,
  },
  verifying: {
    ...WORKING,
    id: 'improvement-invoice',
    targetFile: 'src/billing/invoice.ts',
    status: 'verifying',
    phaseStartedAt: '2026-11-21T14:03:00.000Z',
    usage: { attempts: 2, tokens: 93_000, seconds: 660 },
    attempts: [
      REJECTED_ATTEMPT,
      { ...OPEN_ATTEMPT, tokensUsed: 52_000, patchHash: ACCEPTED_HASH },
    ],
    progress: {
      steps: [
        { code: 'test_files_only', status: 'passed' },
        { code: 'type_check', status: 'passed' },
        { code: 'new_tests_pass', status: 'passed' },
        { code: 'existing_tests_pass', status: 'passed' },
        { code: 'repeated_runs', status: 'running', done: 1, total: 3 },
        { code: 'coverage_increase', status: 'pending' },
        { code: 'mutation_gain', status: 'pending' },
      ],
      updatedAt: STEPS_WRITTEN_AT,
    },
  },
  awaiting_approval: {
    ...WORKING,
    id: 'improvement-sum',
    targetFile: 'src/billing/sum.ts',
    status: 'awaiting_approval',
    mode: 'review',
    waitingFor: 'approval',
    attempts: [ACCEPTED_ATTEMPT],
    createdAt: '2026-11-21T10:52:00.000Z',
    updatedAt: '2026-11-21T11:05:00.000Z',
  },
  publishing: {
    ...WORKING,
    id: 'improvement-rounding',
    targetFile: 'src/billing/rounding.ts',
    status: 'publishing',
    attempts: [ACCEPTED_ATTEMPT],
    branch: 'coverage/rounding-4f2a9c1',
  },
  completed: {
    ...WORKING,
    id: 'improvement-currency',
    targetFile: 'src/billing/currency.ts',
    status: 'completed',
    attempts: [REJECTED_ATTEMPT, { ...ACCEPTED_ATTEMPT, number: 2 }],
    branch: 'coverage/currency-4f2a9c1',
    pullRequest: {
      number: 131,
      url: 'https://github.com/example/payments/pull/131',
    },
    updatedAt: '2026-11-21T13:20:00.000Z',
  },
  failed: {
    ...WORKING,
    id: 'improvement-webhook',
    targetFile: 'src/api/webhook.ts',
    status: 'failed',
    usage: { attempts: 3, tokens: 120_000, seconds: 1680 },
    attempts: [
      REJECTED_ATTEMPT,
      { ...REJECTED_ATTEMPT, number: 2 },
      { ...REJECTED_ATTEMPT, number: 3 },
    ],
    failure: {
      reason: 'budget_exhausted',
      message: '3 attempts were rejected.',
    },
  },
  skipped: {
    ...CREATED,
    id: 'improvement-ids',
    targetFile: 'src/ids.ts',
    status: 'skipped',
    waitingFor: null,
    skip: {
      reason: 'threshold_met',
      message: 'The fresh measurement is already above the threshold.',
    },
  },
  cancelled: {
    ...WORKING,
    id: 'improvement-retry',
    targetFile: 'src/core/retry.ts',
    status: 'cancelled',
    attempts: [
      {
        ...OPEN_ATTEMPT,
        number: 1,
        status: 'closed',
        finishedAt: CANCELLED_AT,
      },
    ],
    updatedAt: CANCELLED_AT,
    cancelledAt: CANCELLED_AT,
  },
};

/** Every sample, as the list of improvements answers them. */
export const IMPROVEMENT_LIST: ImprovementList = {
  items: Object.values(IMPROVEMENT_BY_STATUS),
};

/** The patch of the improvement that waits for approval, with its hash. */
export const PATCH_AWAITING_APPROVAL: ImprovementPatch = {
  improvementId: IMPROVEMENT_BY_STATUS.awaiting_approval.id,
  attemptNumber: ACCEPTED_ATTEMPT.number,
  patch: [
    'diff --git a/src/billing/sum.test.ts b/src/billing/sum.test.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/billing/sum.test.ts',
    '@@ -0,0 +1,7 @@',
    "+import { sumTaxes } from './sum';",
    '+',
    "+describe('sumTaxes', () => {",
    "+  it('should add the tax of every line', () => {",
    '+    expect(sumTaxes([{ net: 100, rate: 0.2 }])).toBe(20);',
    '+  });',
    '+});',
    '',
  ].join('\n'),
  patchHash: ACCEPTED_HASH,
};

/** The list of improvements as it is first shown: narrowed by nothing. */
export const UNNARROWED: Narrowing = {
  status: undefined,
  repositoryId: undefined,
  path: { text: '', typing: false, start: () => undefined, line: null },
};
