import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { newRequestKey } from '#api/request-key';
import { alignedRows, labelled } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import {
  attemptLabel,
  attemptLine,
  besideWords,
  improvementCells,
  waitingWords,
} from '#commands/improvement-words';
import { answeredValue, printFailure, printResult } from '#commands/output';
import { findScanned } from '#commands/repository-lookup';
import { accessPassed } from '#commands/start-access';
import { endCancelled, type Ending, reportStart } from '#commands/started-work';
import { PROGRAM } from '#commands/words';

/**
 * The patch waits for a person: the wait ends with the command that
 * approves it, with the hash of the patch the service stored.
 */
async function endInReview(
  improvement: Improvement,
  io: CommandIo,
): Promise<number> {
  const patch = answeredValue(
    await io.session.api.getImprovementPatch(improvement.id),
    io,
  );
  if (patch === undefined) {
    return EXIT_CODE.failed;
  }
  const approve = `${PROGRAM} approve ${improvement.id} --hash ${patch.patchHash}`;
  return printResult(improvement, () => [approve], io);
}

/** The result a script captures is the address of the pull request. */
const endCompleted: Ending<Improvement> = (improvement, io) =>
  printResult(
    improvement,
    (value) => (value.pullRequest === null ? [] : [value.pullRequest.url]),
    io,
  );

/** Nothing was published, which is no failure: the reason goes with it. */
const endSkipped: Ending<Improvement> = (improvement, io) => {
  io.err(labelled('skipped', besideWords(improvement, io)));
  return printResult(improvement, () => [], io);
};

/** A line while the work goes on, or the ending of a final status. */
type AtStatus =
  | { readonly line: (improvement: Improvement, io: CommandIo) => string }
  | { readonly end: Ending<Improvement> };

/** What `--wait` does at each status, as the example of the document. */
const AT_STATUS: Readonly<Record<ImprovementStatus, AtStatus>> = {
  created: {
    line: (value, io) => labelled('waiting', waitingWords(value, io)),
  },
  analyzing: { line: () => 'analyzing' },
  generating: {
    line: (value) => labelled(attemptLabel(value), 'writing a test'),
  },
  waiting_for_limit: {
    line: (value, io) => labelled('waiting', waitingWords(value, io)),
  },
  verifying: {
    line: (value) => labelled(attemptLabel(value), 'checking the patch'),
  },
  awaiting_approval: { end: endInReview },
  publishing: { line: () => 'publishing' },
  completed: { end: endCompleted },
  failed: { end: (value, io) => printFailure(value.failure, io) },
  cancelled: { end: endCancelled },
  skipped: { end: endSkipped },
};

/**
 * What an improvement says of itself: the verdict of every attempt that
 * ended, then what it does now.
 */
function progressLines(improvement: Improvement, io: CommandIo): string[] {
  const at = AT_STATUS[improvement.status];
  return [
    ...improvement.attempts
      .filter((attempt) => attempt.status === 'closed')
      .map(attemptLine),
    ...('line' in at ? [at.line(improvement, io)] : []),
  ];
}

function endingOf(improvement: Improvement): Ending<Improvement> | undefined {
  const at = AT_STATUS[improvement.status];
  return 'end' in at ? at.end : undefined;
}

/**
 * `improve <repo> <file>`: checks the access, says where a result goes,
 * requests an improvement of a file of the latest snapshot and prints it.
 * With `--wait` it follows the improvement to its end and prints the
 * address of the pull request.
 */
export async function improve(
  command: Command<'improve'>,
  io: CommandIo,
): Promise<number> {
  const scanned = await findScanned(command.repository, io);
  if (
    scanned === undefined ||
    !(await accessPassed(scanned.repository.id, io))
  ) {
    return EXIT_CODE.failed;
  }
  const answer = await io.session.api.startImprovement(
    { ...command.request, snapshotId: scanned.snapshot.id },
    newRequestKey(),
  );
  return reportStart(
    answer,
    {
      wait: command.wait,
      linesOf: (value) => alignedRows([improvementCells(value, io)]),
      watch: {
        ask: (value) => io.session.api.getImprovement(value.id),
        linesOf: (value) => progressLines(value, io),
        endingOf,
      },
    },
    io,
  );
}
