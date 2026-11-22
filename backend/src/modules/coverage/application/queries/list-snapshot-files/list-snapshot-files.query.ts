import type { FileCoverageDto } from '#coverage/application/contracts/coverage-public-api';
import type { CoverageMetric } from '#coverage/domain/value-objects/coverage-counters.vo';

/**
 * The files of a snapshot, narrowed as a person asks, by the id the route
 * gives. A filter left out narrows nothing, and the filters that are given
 * must all hold.
 */
export interface ListSnapshotFilesQuery {
  readonly snapshotId: string;
  /**
   * Only the measured files below this percentage: the files that can be
   * improved. It takes the place of the percentage of the repository.
   */
  readonly below?: number | undefined;
  /**
   * The counter the threshold reads, in place of the one of the repository.
   * Alone it narrows nothing: it changes which files are below and the
   * order.
   */
  readonly metric?: CoverageMetric | undefined;
  /** Only the files in this state. */
  readonly state?: FileCoverageDto['state'] | undefined;
}
