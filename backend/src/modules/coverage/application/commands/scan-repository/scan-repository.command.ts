import type { RepositoryId } from '#kernel/primitives/repository-id';

/** The version of the payload of a scan job this service writes and reads. */
export const SCAN_PAYLOAD_VERSION = 1;

/** Queue a scan of a repository. */
export interface ScanRepositoryCommand {
  readonly repositoryId: RepositoryId;
  /**
   * The key the client made for this command. The same key gives the same
   * scan, and the same key for another repository is a conflict.
   */
  readonly requestKey: string;
}
