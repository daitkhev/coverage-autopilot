import {
  CONTRACT_VERSION,
  type Health,
} from '@coverage-autopilot/api-contracts/health';
import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';
import type {
  AccessCheck,
  Repository,
  RepositoryList,
} from '@coverage-autopilot/api-contracts/repositories';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';
import type {
  SnapshotList,
  SnapshotSummary,
} from '@coverage-autopilot/api-contracts/snapshots';
import type { ScanStatus } from '@coverage-autopilot/api-contracts/statuses';

/*
 * The moments are written against `SAMPLE_NOW`, 14:05 on 2026-11-21, so
 * the ages read as the mock-ups write them: a scan of 2h ago, a step
 * written 1s ago. A commit and a hash end in zeros, so a short one reads
 * as in the mock-ups and the long one stays plainly made up.
 */

/** The head of `example/payments`, which its latest snapshot measured. */
export const PAYMENTS_COMMIT = '4f2a9c1000000000000000000000000000000000';

/** The latest snapshot of `example/payments`, 2h old, at 71.4% of lines. */
export const PAYMENTS_SNAPSHOT: SnapshotSummary = {
  id: 'snapshot-payments-2',
  commitSha: PAYMENTS_COMMIT,
  capturedAt: '2026-11-21T12:05:00.000Z',
  totals: {
    statements: { covered: 1212, total: 1700, percentage: 71.3 },
    branches: { covered: 380, total: 620, percentage: 61.3 },
    functions: { covered: 240, total: 300, percentage: 80 },
    lines: { covered: 1142, total: 1600, percentage: 71.4 },
  },
  threshold: { metric: 'lines', percentage: 80 },
  files: { below: 12, above: 30, unmeasured: 2, noCode: 4 },
  tests: { ran: 412, failed: 0 },
};

/** The snapshots of `example/payments`, newest first. */
export const PAYMENTS_SNAPSHOTS: SnapshotList = {
  items: [
    {
      ...PAYMENTS_SNAPSHOT,
      repositoryId: 'repository-payments',
      parameters: {
        testRunner: 'jest',
        testRunnerVersion: '29.7.0',
        coverageProvider: 'v8',
        packageManager: 'npm',
        configFile: 'jest.config.ts',
        fileListRule: 'src/**/*.ts',
      },
    },
  ],
};

/** Connected, scanned 2h ago, and its head has not moved since. */
export const SCANNED_REPOSITORY: Repository = {
  id: 'repository-payments',
  owner: 'example',
  name: 'payments',
  url: 'https://github.com/example/payments',
  defaultBranch: 'main',
  connectedAt: '2026-11-14T09:30:00.000Z',
  latestSnapshot: PAYMENTS_SNAPSHOT,
  activeScanId: null,
  headCommit: PAYMENTS_COMMIT,
  outdated: false,
  threshold: { metric: 'lines', percentage: 80, isDefault: true },
  install: { mode: 'sandboxed', isDefault: true },
};

/**
 * `example/payments` once a person gave it 90% of lines of its own: more
 * of its files are below.
 */
export const OWN_THRESHOLD_REPOSITORY: Repository = {
  ...SCANNED_REPOSITORY,
  latestSnapshot: {
    ...PAYMENTS_SNAPSHOT,
    threshold: { metric: 'lines', percentage: 90 },
    files: { below: 20, above: 22, unmeasured: 2, noCode: 4 },
  },
  threshold: { metric: 'lines', percentage: 90, isDefault: false },
};

/** Tests that failed in the sandbox at the latest scan: 33 of 53. */
export const FAILING_TESTS = { ran: 53, failed: 33 } as const;

/** `example/payments` whose latest scan ran with tests that failed. */
export const FAILING_TESTS_REPOSITORY: Repository = {
  ...SCANNED_REPOSITORY,
  latestSnapshot: { ...PAYMENTS_SNAPSHOT, tests: FAILING_TESTS },
};

/** Connected a minute ago, and never scanned. */
export const NEVER_SCANNED_REPOSITORY: Repository = {
  ...SCANNED_REPOSITORY,
  id: 'repository-notifier',
  name: 'notifier',
  url: 'https://github.com/example/notifier',
  connectedAt: '2026-11-21T14:04:00.000Z',
  latestSnapshot: null,
  headCommit: null,
};

/** Its first scan runs: `RUNNING_SCAN`. */
export const SCANNING_REPOSITORY: Repository = {
  ...NEVER_SCANNED_REPOSITORY,
  id: 'repository-gateway',
  name: 'gateway',
  url: 'https://github.com/example/gateway',
  activeScanId: 'scan-gateway-1',
};

/** Its head moved past the commit of its latest snapshot. */
export const OUTDATED_REPOSITORY: Repository = {
  ...SCANNED_REPOSITORY,
  id: 'repository-billing-api',
  name: 'billing-api',
  url: 'https://github.com/example/billing-api',
  latestSnapshot: {
    ...PAYMENTS_SNAPSHOT,
    id: 'snapshot-billing-api-1',
    commitSha: '91be03d000000000000000000000000000000000',
    capturedAt: '2026-11-20T11:40:00.000Z',
  },
  headCommit: '7c3e5a2000000000000000000000000000000000',
  outdated: true,
};

export const REPOSITORY_LIST: RepositoryList = {
  items: [
    SCANNED_REPOSITORY,
    SCANNING_REPOSITORY,
    OUTDATED_REPOSITORY,
    NEVER_SCANNED_REPOSITORY,
  ],
};

/** Every step passed, and the head of the default branch was read. */
export const ACCESS_PASSED: AccessCheck = {
  repositoryId: SCANNED_REPOSITORY.id,
  checkedAt: '2026-11-21T14:04:58.000Z',
  passed: true,
  headCommit: PAYMENTS_COMMIT,
  destination: { route: 'repository' },
  steps: [
    { name: 'git_present', status: 'passed', message: null, toolOutput: null },
    {
      name: 'gh_authenticated',
      status: 'passed',
      message: null,
      toolOutput: null,
    },
    { name: 'push_allowed', status: 'passed', message: null, toolOutput: null },
  ],
};

/** Passed for an account that may not push: a result goes to its fork. */
export const ACCESS_PASSED_TO_FORK: AccessCheck = {
  ...ACCESS_PASSED,
  destination: { route: 'fork', account: 'payments-bot' },
};

/** Refused at the login of gh, so the step after it never ran. */
export const ACCESS_REFUSED: AccessCheck = {
  repositoryId: NEVER_SCANNED_REPOSITORY.id,
  checkedAt: '2026-11-21T14:04:58.000Z',
  passed: false,
  headCommit: null,
  destination: null,
  steps: [
    { name: 'git_present', status: 'passed', message: null, toolOutput: null },
    {
      name: 'gh_authenticated',
      status: 'failed',
      message: 'gh is not logged in. Run gh auth login, then check again.',
      toolOutput: 'You are not logged into any hosts. Run: gh auth login',
    },
    {
      name: 'push_allowed',
      status: 'not_run',
      message: null,
      toolOutput: null,
    },
  ],
};

const QUEUED_SCAN: Scan = {
  id: 'scan-payments-3',
  repositoryId: SCANNED_REPOSITORY.id,
  status: 'queued',
  queuedAt: '2026-11-21T14:04:50.000Z',
  startedAt: null,
  finishedAt: null,
  progress: null,
  snapshotId: null,
  failure: null,
};

const FAILED_SCAN: Scan = {
  ...QUEUED_SCAN,
  id: 'scan-payments-1',
  status: 'failed',
  queuedAt: '2026-11-21T09:00:00.000Z',
  startedAt: '2026-11-21T09:00:02.000Z',
  finishedAt: '2026-11-21T09:01:07.000Z',
  failure: {
    reason: 'install_failed',
    message: 'The packages of the project could not be installed.',
  },
};

/** A scan in each status. The running one is 40s in, at its tests. */
export const SCAN_BY_STATUS: Readonly<Record<ScanStatus, Scan>> = {
  queued: QUEUED_SCAN,
  running: {
    ...QUEUED_SCAN,
    id: 'scan-gateway-1',
    repositoryId: SCANNING_REPOSITORY.id,
    status: 'running',
    queuedAt: '2026-11-21T14:04:18.000Z',
    startedAt: '2026-11-21T14:04:20.000Z',
    progress: {
      steps: [
        { code: 'clone', status: 'passed' },
        { code: 'install', status: 'passed' },
        { code: 'test_run', status: 'running' },
        { code: 'read_report', status: 'pending' },
      ],
      updatedAt: '2026-11-21T14:04:59.000Z',
    },
  },
  completed: {
    ...QUEUED_SCAN,
    id: 'scan-payments-2',
    status: 'completed',
    queuedAt: '2026-11-21T12:03:50.000Z',
    startedAt: '2026-11-21T12:03:52.000Z',
    finishedAt: PAYMENTS_SNAPSHOT.capturedAt,
    snapshotId: PAYMENTS_SNAPSHOT.id,
  },
  failed: FAILED_SCAN,
  cancelled: {
    ...QUEUED_SCAN,
    id: 'scan-payments-0',
    status: 'cancelled',
    queuedAt: '2026-11-20T16:00:00.000Z',
    startedAt: '2026-11-20T16:00:01.000Z',
    finishedAt: '2026-11-20T16:00:30.000Z',
  },
};

/** A test run that ended and wrote no coverage report. */
export const REPORT_MISSING_SCAN: Scan = {
  ...FAILED_SCAN,
  failure: {
    reason: 'coverage_report_missing',
    message:
      'The test runner ended and wrote no coverage report, so no file ' +
      'was measured. The output of the tests says why.',
  },
};

/** Started 3h 12m ago, with nothing running. */
export const IDLE_HEALTH: Health = {
  ready: true,
  contractVersion: CONTRACT_VERSION,
  serviceVersion: '0.1.0',
  startedAt: '2026-11-21T10:53:00.000Z',
  githubAccount: 'example-user',
  generator: {
    cli: 'claude_code',
    billing: 'subscription',
    limits: {
      observedAt: '2026-11-21T13:58:00.000Z',
      fiveHour: { usedPercent: 34, resetsAt: '2026-11-21T16:00:00.000Z' },
      sevenDay: null,
    },
  },
  worker: { alive: true, lastSeenAt: '2026-11-21T14:04:59.000Z' },
  activeWork: { scans: 0, improvements: 0 },
  tools: [
    { name: 'git', version: '2.47.1' },
    { name: 'gh', version: null },
  ],
};

/** A scan and two improvements run, so it is not restarted. */
export const BUSY_HEALTH: Health = {
  ...IDLE_HEALTH,
  activeWork: { scans: 1, improvements: 2 },
};

/** A service of an older contract, which an idle client replaces. */
export const OTHER_VERSION_HEALTH: Health = {
  ...IDLE_HEALTH,
  contractVersion: CONTRACT_VERSION - 1,
  serviceVersion: '0.0.9',
};

/** The defaults and the maximums the service answers with. */
export const BUDGET_SETTINGS: BudgetSettings = {
  defaults: { attempts: 3, tokens: null, minutes: 30 },
  maximums: { attempts: 10, tokens: null, minutes: 120 },
};
