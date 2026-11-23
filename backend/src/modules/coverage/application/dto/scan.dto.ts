import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';
import type { JobProgress } from '#ports/job-queue.port';

/** A scan is a job to the service, but a person never sees a job. */
export type ScanStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * `test_run_timed_out`: the tests ran past the time limit of a scan.
 * `coverage_report_missing`: the test runner ended and wrote no report.
 * `retries_exhausted`: the scan stopped on a fault and nothing runs it
 * again.
 */
export type ScanFailureReason =
  | 'unsupported_project'
  | 'install_failed'
  | 'test_run_timed_out'
  | 'coverage_report_missing'
  | 'retries_exhausted';

/** A stable code for scripts and a sentence for people. */
interface ScanFailureDto {
  readonly reason: ScanFailureReason;
  readonly message: string;
}

/** The steps of a running scan and the time of the last write. */
export interface ScanProgressDto extends JobProgress {
  readonly updatedAt: Instant;
}

/** A scan as a person sees it. Its id is the id of its job. */
export interface ScanDto {
  readonly id: string;
  readonly repositoryId: RepositoryId;
  readonly status: ScanStatus;
  readonly queuedAt: Instant;
  /** When a worker first took it, kept when it went back to the queue. */
  readonly startedAt: Instant | null;
  /** When it completed, failed or was cancelled. */
  readonly finishedAt: Instant | null;
  /** `null` unless a worker runs it now and has written a step. */
  readonly progress: ScanProgressDto | null;
  /** Set once it completed. */
  readonly snapshotId: string | null;
  /** Set once it failed. */
  readonly failure: ScanFailureDto | null;
}
