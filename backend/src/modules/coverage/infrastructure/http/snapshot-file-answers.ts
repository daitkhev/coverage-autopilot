import type {
  FileCoverage,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type {
  SnapshotFileDto,
  SnapshotFilesDto,
} from '#coverage/application/dto/snapshot-files.dto';

/** The contract names the counters of a measured file its coverage. */
function fileAnswerOf(file: SnapshotFileDto): FileCoverage {
  if (file.state !== 'measured') {
    return { ...file, path: file.path.value };
  }
  return {
    path: file.path.value,
    state: file.state,
    coverage: file.counters,
    belowThreshold: file.belowThreshold,
    uncoveredLines: [...file.uncoveredLines],
    openBranchLines: [...file.openBranchLines],
    uncoveredFunctions: [...file.uncoveredFunctions],
    latestImprovement: file.latestImprovement,
  };
}

/** The files of a snapshot in the words of the contract: paths as text. */
export function snapshotFilesAnswerOf(files: SnapshotFilesDto): SnapshotFiles {
  return {
    snapshotId: files.snapshotId,
    threshold: files.threshold,
    items: files.items.map(fileAnswerOf),
  };
}
