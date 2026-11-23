import type { Threshold } from '@coverage-autopilot/api-contracts/coverage';
import type {
  FileCoverage,
  ImprovementRef,
  MeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';

import { alignedRows, type Cells } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { printAnswer } from '#commands/output';
import { findLatestSnapshot } from '#commands/repository-lookup';
import { percentText, statusText } from '#commands/words';
import { percentWords, ratioWords } from '#theme/counts';
import {
  FILE_STATE,
  IMPROVEMENT_STATUS,
  UNMEASURED_REASON,
} from '#theme/status';

/** The latest improvement of a file, by which `status` and `cancel` find it. */
function workText(work: ImprovementRef | null, io: CommandIo): string {
  return work === null
    ? ''
    : `${statusText(IMPROVEMENT_STATUS[work.status], io)} ${work.id}`;
}

/** Beside each file, the percent it was judged by: `below 80.0%`. */
function measuredCells(
  file: MeasuredFile,
  threshold: Threshold,
  io: CommandIo,
): Cells {
  const counter = file.coverage[threshold.metric];
  const side = file.belowThreshold ? 'below' : 'at or above';
  return [
    file.path,
    percentText(counter),
    ratioWords(counter.covered, counter.total),
    `${side} ${percentWords(threshold.percentage)}`,
    workText(file.latestImprovement, io),
  ];
}

/**
 * One file in a line. A file without numbers has no percentage: it shows
 * the figure of its state and, when it was not measured, the reason, in
 * the last column, where a measured file shows its latest improvement.
 */
function fileCells(
  file: FileCoverage,
  threshold: Threshold,
  io: CommandIo,
): Cells {
  if (file.state === 'measured') {
    return measuredCells(file, threshold, io);
  }
  const { figure = '', word } = FILE_STATE[file.state];
  const reason =
    file.state === 'unmeasured' ? UNMEASURED_REASON[file.reason].said : '';
  return [file.path, figure, '', word, reason];
}

/**
 * `files <repo>`: one line for each file of the latest snapshot, in the
 * order the service gives them, judged by the threshold of the repository
 * or the one the flags name.
 */
export async function files(
  command: Command<'files'>,
  io: CommandIo,
): Promise<number> {
  const snapshot = await findLatestSnapshot(command.repository, io);
  if (snapshot === undefined) {
    return EXIT_CODE.failed;
  }
  const answer = await io.session.api.listSnapshotFiles(
    snapshot.id,
    command.query,
  );
  return printAnswer(
    answer,
    (list) =>
      alignedRows(
        list.items.map((file) => fileCells(file, list.threshold, io)),
      ),
    io,
  );
}
