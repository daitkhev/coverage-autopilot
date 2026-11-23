/** A person stops a scan, whatever it is doing. */
export interface CancelScanCommand {
  readonly scanId: string;
}
