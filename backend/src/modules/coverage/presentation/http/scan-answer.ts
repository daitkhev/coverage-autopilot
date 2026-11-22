import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { ScanDto } from '#coverage/application/dto/scan.dto';

/** A scan in the words of the contract. */
export function scanAnswerOf(scan: ScanDto): Scan {
  const { progress } = scan;
  return {
    id: scan.id,
    repositoryId: scan.repositoryId.value,
    status: scan.status,
    queuedAt: scan.queuedAt.toString(),
    startedAt: scan.startedAt?.toString() ?? null,
    finishedAt: scan.finishedAt?.toString() ?? null,
    progress:
      progress === null
        ? null
        : {
            steps: [...progress.steps],
            updatedAt: progress.updatedAt.toString(),
          },
    snapshotId: scan.snapshotId,
    failure: scan.failure,
  };
}
