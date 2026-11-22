import type {
  Attempt,
  CheckResult,
} from '@coverage-autopilot/api-contracts/attempts';

import { INVOICE_COVERAGE } from '#tests/support/sample-files';

const REJECTED_HASH =
  '20cd938000000000000000000000000000000000000000000000000000000000';
/** The hash of the patch the gate accepted, which waits for approval. */
export const ACCEPTED_HASH =
  '9c1e7ab000000000000000000000000000000000000000000000000000000000';

const PASSED = {
  status: 'passed',
  retryable: false,
  runs: null,
  message: null,
} as const;

/** The seven checks of the gate in their order, each passed in its time. */
const PASSED_CHECKS: readonly CheckResult[] = [
  { ...PASSED, name: 'test_files_only', durationMs: 200 },
  { ...PASSED, name: 'type_check', durationMs: 14_000 },
  { ...PASSED, name: 'new_tests_pass', durationMs: 9000 },
  { ...PASSED, name: 'existing_tests_pass', durationMs: 108_000 },
  { ...PASSED, name: 'repeated_runs', durationMs: 27_000, runs: 3 },
  { ...PASSED, name: 'coverage_increase', durationMs: 12_000 },
  { ...PASSED, name: 'mutation_gain', durationMs: 341_000 },
];

/** The first attempt of `src/billing/invoice.ts`: its tests detect none of the 14 mutants. */
export const REJECTED_ATTEMPT: Attempt = {
  number: 1,
  status: 'closed',
  startedAt: '2026-11-21T13:52:00.000Z',
  finishedAt: '2026-11-21T13:56:03.000Z',
  generationOutcome: 'generated',
  tokensUsed: 41_000,
  patchHash: REJECTED_HASH,
  report: {
    patchHash: REJECTED_HASH,
    verdict: 'rejected',
    reasons: ['The new tests detect 0 of 14 mutants.'],
    checks: [
      ...PASSED_CHECKS.slice(0, -1),
      {
        name: 'mutation_gain',
        status: 'failed',
        retryable: false,
        durationMs: 298_000,
        runs: null,
        message: 'The new tests detect 0 of 14 mutants.',
      },
    ],
    coverageBefore: INVOICE_COVERAGE,
    coverageAfter: {
      ...INVOICE_COVERAGE,
      lines: { covered: 30, total: 51, percentage: 58.8 },
    },
    mutants: { undetectedBefore: 14, killed: 0, reached: 9 },
    survivingMutants: [
      {
        line: 19,
        mutator: 'ConditionalExpression',
        replacement: 'true',
        reached: true,
      },
      {
        line: 61,
        mutator: 'ArithmeticOperator',
        replacement: 'total + rate',
        reached: false,
      },
    ],
  },
  rawOutputPaths: ['/tmp/coverage-autopilot/output/attempt-1.jsonl'],
};

/** The second attempt, still writing its test. */
export const OPEN_ATTEMPT: Attempt = {
  ...REJECTED_ATTEMPT,
  number: 2,
  status: 'open',
  startedAt: '2026-11-21T13:56:10.000Z',
  finishedAt: null,
  generationOutcome: null,
  tokensUsed: 0,
  patchHash: null,
  report: null,
  rawOutputPaths: [],
};

/** The attempt whose patch passed the gate: 11 of 14 mutants detected. */
export const ACCEPTED_ATTEMPT: Attempt = {
  ...REJECTED_ATTEMPT,
  finishedAt: '2026-11-21T13:58:41.000Z',
  tokensUsed: 52_000,
  patchHash: ACCEPTED_HASH,
  report: {
    patchHash: ACCEPTED_HASH,
    verdict: 'accepted',
    reasons: [],
    checks: [...PASSED_CHECKS],
    coverageBefore: INVOICE_COVERAGE,
    coverageAfter: {
      ...INVOICE_COVERAGE,
      lines: { covered: 45, total: 51, percentage: 88.2 },
    },
    mutants: { undetectedBefore: 14, killed: 11, reached: 13 },
    survivingMutants: [],
  },
};
