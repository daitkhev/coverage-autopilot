import type {
  FileCoverage,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type {
  SnapshotFileDto,
  SnapshotFilesDto,
} from '#improvement/application/dto/snapshot-files.dto';

function fileAnswerOf(file: SnapshotFileDto): FileCoverage {
  if (file.state !== 'measured') {
    return { ...file, path: file.path.value };
  }
  return {
    path: file.path.value,
    state: file.state,
    coverage: file.coverage,
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
