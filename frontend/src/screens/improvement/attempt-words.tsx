import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';

import { countWords } from '#theme/counts';
import type { Role } from '#theme/roles';
import { unjudgedWords } from '#theme/status';

/** A line under an attempt that says what became of it. */
export interface AttemptResult {
  readonly text: string;
  readonly role?: Role;
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
    return [{ text: unjudgedWords(generationOutcome) }];
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
