import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';

/** The files of a snapshot that can be improved. */
export interface ListFilesBelowThresholdQuery {
  readonly snapshotId: string;
  /** Another threshold than the one of the settings, when a person asks. */
  readonly threshold?: CoverageThreshold;
}
