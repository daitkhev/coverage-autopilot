import type { SnapshotFilesRequest } from '#coverage/application/contracts/coverage-public-api';

/**
 * The files of a snapshot, narrowed as a person asks, as the route gives
 * them. A filter left out narrows nothing.
 */
export interface ListSnapshotFilesQuery {
  readonly snapshotId: string;
  /** Only the measured files below this percentage. */
  readonly below?: number | undefined;
  /** The counter the threshold reads, in place of the one of the settings. */
  readonly metric?: SnapshotFilesRequest['metric'];
  readonly state?: SnapshotFilesRequest['state'];
}
