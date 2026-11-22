import type { Scan } from '@coverage-autopilot/api-contracts/scans';
import type { Snapshot } from '@coverage-autopilot/api-contracts/snapshots';
import type {
  CoverageMetric,
  ScanStatus,
} from '@coverage-autopilot/api-contracts/statuses';

import { newRequestKey } from '#api/request-key';
import { alignedRows, labelled } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { answeredValue, printFailure, printResult } from '#commands/output';
import { findRepository } from '#commands/repository-lookup';
import { runningStep, scanCells } from '#commands/scan-words';
import { endCancelled, type Ending, reportStart } from '#commands/started-work';
import { percentText } from '#commands/words';
import { ratioWords } from '#theme/counts';

/** The counters of a snapshot in the order the screens show them. */
const COUNTERS: readonly CoverageMetric[] = [
  'lines',
  'branches',
  'functions',
  'statements',
];

function totalsLines(snapshot: Snapshot): string[] {
  return alignedRows(
    COUNTERS.map((metric) => {
      const counter = snapshot.totals[metric];
      return [
        metric,
        percentText(counter),
        ratioWords(counter.covered, counter.total),
      ];
    }),
  );
}

/**
 * The totals of the snapshot the scan made. The scan names it, and the
 * snapshots of its repository hold it.
 */
async function printTotals(scan: Scan, io: CommandIo): Promise<number> {
  const snapshots = answeredValue(
    await io.session.api.listSnapshots(scan.repositoryId),
    io,
  );
  if (snapshots === undefined) {
    return EXIT_CODE.failed;
  }
  const snapshot = snapshots.items.find((each) => each.id === scan.snapshotId);
  if (snapshot === undefined) {
    throw new Error(
      `The scan ${scan.id} completed, and its repository lists no snapshot ${String(scan.snapshotId)}.`,
    );
  }
  return printResult(snapshot, totalsLines, io);
}

/** How `--wait` ends at each status of a scan, and none while it goes on. */
const ENDINGS: Readonly<Record<ScanStatus, Ending<Scan> | undefined>> = {
  queued: undefined,
  running: undefined,
  completed: printTotals,
  failed: (scan, io) => printFailure(scan.failure, io),
  cancelled: endCancelled,
};

/**
 * A line for the status and the step of a scan while it goes on. A final
 * status is said by how the wait ends.
 */
function progressLines(scan: Scan): string[] {
  return ENDINGS[scan.status] === undefined
    ? [labelled(scan.status, runningStep(scan))]
    : [];
}

/**
 * `scan <repo>`: queues a scan and prints it. With `--wait` it follows
 * the scan to its end and prints the totals of the snapshot it made.
 */
export async function scan(
  command: Command<'scan'>,
  io: CommandIo,
): Promise<number> {
  const repository = await findRepository(command.repository, io);
  if (repository === undefined) {
    return EXIT_CODE.failed;
  }
  const answer = await io.session.api.startScan(repository.id, newRequestKey());
  return reportStart(
    answer,
    {
      wait: command.wait,
      linesOf: (value) => alignedRows([scanCells(value, io)]),
      watch: {
        ask: (value) => io.session.api.getScan(value.id),
        linesOf: progressLines,
        endingOf: (value) => ENDINGS[value.status],
      },
    },
    io,
  );
}
