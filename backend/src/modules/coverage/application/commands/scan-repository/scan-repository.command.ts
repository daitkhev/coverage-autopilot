/** The version of the payload of a scan job this service writes and reads. */
export const SCAN_PAYLOAD_VERSION = 1;

/** Queue a scan of a repository. */
export interface ScanRepositoryCommand {
  /** The id of the repository as the route gives it. */
  readonly repositoryId: string;
  /**
   * The key the client made for this command. The same key gives the same
   * scan, and the same key for another repository is a conflict.
   */
  readonly requestKey: string;
}
