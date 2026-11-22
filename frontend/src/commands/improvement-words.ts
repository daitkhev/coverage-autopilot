import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { type Cells, labelled } from '#commands/columns';
import type { CommandIo } from '#commands/command-io';
import { reasonText, statusText } from '#commands/words';
import { percentWords } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { ATTEMPT_VERDICT, IMPROVEMENT_STATUS, waitWords } from '#theme/status';

type Words = (improvement: Improvement, io: CommandIo) => string;

/** What a waiting improvement waits for, and until when if it knows. */
export const waitingWords: Words = (improvement, io) =>
  waitWords(improvement, io.session.timeZone);

/** The attempt that runs, as the service counts the attempts it spent. */
export function attemptLabel(improvement: Improvement): string {
  return `attempt ${String(improvement.usage.attempts)}`;
}

const ofBudget: Words = (improvement) =>
  `${attemptLabel(improvement)} of ${String(improvement.budget.attempts)}`;

/** What stands beside the status of an improvement, as the status table says. */
const BESIDE: Readonly<Record<ImprovementStatus, Words>> = {
  created: (improvement, io) => `waits ${waitingWords(improvement, io)}`,
  analyzing: () => 'analyzing',
  generating: (improvement, io) =>
    `${ofBudget(improvement, io)}, writing a test`,
  waiting_for_limit: (improvement, io) =>
    `waits ${waitingWords(improvement, io)}`,
  verifying: (improvement, io) =>
    `${ofBudget(improvement, io)}, checking the patch`,
  awaiting_approval: () => 'approve the patch',
  publishing: () => 'publishing',
  completed: (improvement) => improvement.pullRequest?.url ?? '',
  failed: (improvement) =>
    improvement.failure === null ? '' : reasonText(improvement.failure),
  cancelled: (improvement, io) =>
    improvement.cancelledAt === null
      ? ''
      : `cancelled ${ageWords(improvement.cancelledAt, io.session.now())} ago`,
  skipped: (improvement) =>
    improvement.skip === null ? '' : reasonText(improvement.skip),
};

/** What stands beside the status: the next step, the reason or the result. */
export const besideWords: Words = (improvement, io) =>
  BESIDE[improvement.status](improvement, io);

/** The status of an improvement with what stands beside it: `✓ DONE  url`. */
export function statusWords(improvement: Improvement, io: CommandIo): string {
  const status = statusText(IMPROVEMENT_STATUS[improvement.status], io);
  return `${status}  ${besideWords(improvement, io)}`.trimEnd();
}

/** One improvement in a list: its status, id, file, age and next step. */
export function improvementCells(
  improvement: Improvement,
  io: CommandIo,
): Cells {
  return [
    statusText(IMPROVEMENT_STATUS[improvement.status], io),
    improvement.id,
    improvement.targetFile,
    ageWords(improvement.updatedAt, io.session.now()),
    besideWords(improvement, io),
  ];
}

/**
 * An accepted patch is said by what it reached. The gate judges lines
 * first, so the line counter is the one said, as in the document.
 */
function acceptedWords(report: VerificationReport): string {
  const parts: string[] = [];
  const lines = report.coverageAfter?.lines.percentage ?? null;
  if (lines !== null) {
    parts.push(`lines ${percentWords(lines)}`);
  }
  if (report.mutants !== null) {
    const { killed, undetectedBefore } = report.mutants;
    parts.push(
      `${String(killed)} of ${String(undetectedBefore)} mutants detected`,
    );
  }
  return parts.join(', ');
}

function verdictWords(report: VerificationReport): string {
  const details =
    report.verdict === 'accepted'
      ? acceptedWords(report)
      : report.reasons.join(' ');
  const { word } = ATTEMPT_VERDICT[report.verdict];
  return details === '' ? word : `${word}: ${details}`;
}

function attemptWords(attempt: Attempt): string {
  if (attempt.report !== null) {
    return verdictWords(attempt.report);
  }
  if (attempt.status === 'open') {
    return 'running';
  }
  return attempt.generationOutcome === null
    ? 'ended with no verdict'
    : `ended with no verdict (${attempt.generationOutcome})`;
}

/** One attempt as the lines of `--wait` say it: `attempt 1    rejected: ...`. */
export function attemptLine(attempt: Attempt): string {
  return labelled(`attempt ${String(attempt.number)}`, attemptWords(attempt));
}
