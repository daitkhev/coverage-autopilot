import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';

import {
  NO_VERDICT,
  NOT_WRITTEN,
  OUTCOME_WORDS,
} from '#screens/improvement/improvement-words';
import { countWords } from '#theme/counts';
import type { Role } from '#theme/roles';
import { ATTEMPT_VERDICT, CHECK_STATUS, type StatusLook } from '#theme/status';

/** A line under an attempt that says what became of it. */
export interface AttemptResult {
  readonly text: string;
  readonly role?: Role;
}

/** How an attempt looks: running, judged, or stopped with no verdict. */
export function attemptLook(attempt: Attempt): StatusLook {
  if (attempt.status === 'open') {
    return CHECK_STATUS.running;
  }
  return attempt.report === null
    ? NO_VERDICT
    : ATTEMPT_VERDICT[attempt.report.verdict];
}

function passedWords(report: VerificationReport): string {
  const passed = report.checks.filter((check) => check.status === 'passed');
  return `${String(passed.length)} of ${countWords(report.checks.length, 'check')} passed`;
}

/**
 * What became of an attempt, in plain words: the reasons of the gate, the
 * checks it passed, or why it stopped before a verdict. A running attempt
 * has no result yet.
 */
export function resultsOf(attempt: Attempt): AttemptResult[] {
  const { report, generationOutcome } = attempt;
  if (attempt.status === 'open') {
    return [];
  }
  if (report === null) {
    const text =
      generationOutcome === null
        ? NOT_WRITTEN
        : OUTCOME_WORDS[generationOutcome];
    return [{ text }];
  }
  switch (report.verdict) {
    case 'rejected':
      return report.reasons.map((text) => ({ text }));
    case 'inconclusive':
      return [
        {
          text: 'the checks could not finish, so the same patch runs again',
          role: 'warning',
        },
      ];
    case 'accepted':
      return [{ text: passedWords(report) }];
  }
}
