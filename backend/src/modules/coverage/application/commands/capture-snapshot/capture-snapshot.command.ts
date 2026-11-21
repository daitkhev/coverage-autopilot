import type { CaptureSnapshotRequest } from '#coverage/contracts/coverage-public-api';

/**
 * Measure a repository at a commit and keep the snapshot under the origin
 * key, or find the one kept under it before.
 */
export type CaptureSnapshotCommand = CaptureSnapshotRequest;
