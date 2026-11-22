import {
  SCAN_OUTCOME_VERSION,
  type ScanOutcome,
} from '#coverage/application/commands/run-scan/scan-outcome';
import type {
  ScanDto,
  ScanFailureReason,
  ScanProgressDto,
  ScanStatus,
} from '#coverage/application/dto/scan.dto';
import { UnreadableScanOutcomeError } from '#coverage/application/errors/unreadable-scan-outcome.error';
import type { JobDocument, JobDto } from '#ports/job-queue.port';

/** How a scan stands, or how it ended. */
type ScanState = Pick<ScanDto, 'status' | 'snapshotId' | 'failure'>;

type OutcomeKind = ScanOutcome['outcome'];

const INSTALL_FAILED = 'The packages of the project could not be installed.';

const TEST_RUN_TIMED_OUT =
  'The tests ran past the time limit of a scan, so no file was measured.';

const COVERAGE_REPORT_MISSING =
  'The test runner ended and wrote no coverage report, so no file was ' +
  'measured. The output of the tests says why.';

const REPOSITORY_REMOVED = 'The repository was removed before the scan ran.';

const RETRIES_EXHAUSTED =
  'The scan stopped on an error on its last run, and nothing runs it again.';

function stateOf(status: ScanStatus): ScanState {
  return { status, snapshotId: null, failure: null };
}

function failedWith(reason: ScanFailureReason, message: string): ScanState {
  return { status: 'failed', snapshotId: null, failure: { reason, message } };
}

function textIn(outcome: JobDocument, field: string): string {
  const value = outcome[field];
  if (typeof value !== 'string') {
    throw new UnreadableScanOutcomeError(
      `The outcome of a scan has no text in "${field}".`,
    );
  }
  return value;
}

/**
 * The contract of a scan has no reason for a fault, and to a person a
 * scan that a fault ended means what spent retries mean: it failed, and
 * nothing runs it again. So does a repository removed before the scan
 * ran. The record makes every outcome a scan job writes have a reading.
 */
const STATE_OF_OUTCOME: Readonly<
  Record<OutcomeKind, (outcome: JobDocument) => ScanState>
> = {
  captured: (outcome) => ({
    status: 'completed',
    snapshotId: textIn(outcome, 'snapshotId'),
    failure: null,
  }),
  unsupported_project: (outcome) =>
    failedWith('unsupported_project', textIn(outcome, 'detail')),
  install_failed: () => failedWith('install_failed', INSTALL_FAILED),
  test_run_timed_out: () =>
    failedWith('test_run_timed_out', TEST_RUN_TIMED_OUT),
  coverage_report_missing: () =>
    failedWith('coverage_report_missing', COVERAGE_REPORT_MISSING),
  failed: (outcome) =>
    failedWith('retries_exhausted', textIn(outcome, 'message')),
  repository_not_found: () =>
    failedWith('retries_exhausted', REPOSITORY_REMOVED),
};

function isOutcomeKind(kind: unknown): kind is OutcomeKind {
  return typeof kind === 'string' && Object.hasOwn(STATE_OF_OUTCOME, kind);
}

function completedStateOf(job: JobDto): ScanState {
  const { outcome } = job;
  const kind = outcome?.['outcome'];
  if (outcome?.version !== SCAN_OUTCOME_VERSION || !isOutcomeKind(kind)) {
    throw new UnreadableScanOutcomeError(
      `Scan ${job.id} completed with an outcome this service does not read.`,
    );
  }
  return STATE_OF_OUTCOME[kind](outcome);
}

function stateOfJob(job: JobDto): ScanState {
  switch (job.status) {
    case 'pending':
      return stateOf('queued');
    case 'leased':
      return stateOf('running');
    case 'cancelled':
      return stateOf('cancelled');
    case 'dead':
      return failedWith('retries_exhausted', RETRIES_EXHAUSTED);
    case 'completed':
      return completedStateOf(job);
  }
}

/**
 * A scan in its own words. The job tells how it stands and how it ended:
 *
 * | Job | Outcome | Scan |
 * | --- | --- | --- |
 * | `pending` | | `queued`, also when it waits for a retry |
 * | `leased` | | `running` |
 * | `completed` | `captured` | `completed`, with its snapshot |
 * | `completed` | `unsupported_project`, `install_failed`, `test_run_timed_out`, `coverage_report_missing` | `failed` with that reason |
 * | `completed` | `failed`, `repository_not_found` | `failed` with `retries_exhausted` |
 * | `dead` | | `failed` with `retries_exhausted` |
 * | `cancelled` | | `cancelled` |
 */
export function scanDtoOf(
  job: JobDto,
  progress: ScanProgressDto | null,
): ScanDto {
  return {
    id: job.id,
    repositoryId: job.repositoryId,
    ...stateOfJob(job),
    queuedAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.endedAt,
    progress,
  };
}
