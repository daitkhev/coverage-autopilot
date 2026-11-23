import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { Cells } from '#commands/columns';
import type { CommandIo } from '#commands/command-io';
import { reasonText, statusText } from '#commands/words';
import { SCAN_STATUS } from '#theme/status';

/**
 * The step a scan is at, by the code the service gave it, or nothing
 * between two steps. A step is a hint for people, so its code is said as
 * it is.
 */
export function runningStep(scan: Scan): string {
  return (
    scan.progress?.steps.find((step) => step.status === 'running')?.code ?? ''
  );
}

/** One scan in a line: its status, its id, and its step or its failure. */
export function scanCells(scan: Scan, io: CommandIo): Cells {
  return [
    statusText(SCAN_STATUS[scan.status], io),
    scan.id,
    scan.failure === null ? runningStep(scan) : reasonText(scan.failure),
  ];
}
