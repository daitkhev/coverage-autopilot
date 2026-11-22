import type { UnsupportedProjectReason } from '#coverage/application/contracts/coverage-public-api';

/** The version of the outcome of a scan job this service writes and reads. */
export const SCAN_OUTCOME_VERSION = 1;

/**
 * What a scan job ends with, stored with the completed job: the answer of
 * a scan reads it back. `failed`: a fault that a run again would meet as
 * well. `repository_not_found`: the repository was removed before the
 * scan ran. A type and not an interface, so it is a document of the queue.
 */
export type ScanOutcome = { readonly version: typeof SCAN_OUTCOME_VERSION } & (
  | { readonly outcome: 'captured'; readonly snapshotId: string }
  | {
      readonly outcome: 'unsupported_project';
      readonly reason: UnsupportedProjectReason;
      readonly detail: string;
    }
  | {
      readonly outcome:
        'install_failed' | 'test_run_timed_out' | 'coverage_report_missing';
      readonly outputReference: string | null;
    }
  | {
      readonly outcome: 'failed';
      readonly code: string;
      readonly message: string;
    }
  | { readonly outcome: 'repository_not_found' }
);
