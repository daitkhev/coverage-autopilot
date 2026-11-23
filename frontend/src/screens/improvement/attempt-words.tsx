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

/** The history stays short: the full output is in the raw output. */
const MOST_FAILURE_LINES = 2;

function passedWords(report: VerificationReport): string {
  const passed = report.checks.filter((check) => check.status === 'passed');
  return `${String(passed.length)} of ${countWords(report.checks.length, 'check')} passed`;
}

/** Where the tests of a rejected patch failed first, and what the run said. */
function failureResults(report: VerificationReport): AttemptResult[] {
  const failure =
    report.checks.find((check) => check.testFailure !== null)?.testFailure ??
    null;
  if (failure === null) {
    return [];
  }
  const place =
    failure.test === null
      ? `${failure.file} failed to run:`
      : `${failure.test} failed in ${failure.file}:`;
  return [place, ...failure.lines.slice(0, MOST_FAILURE_LINES)].map((text) => ({
    text,
  }));
}

/**
 * What became of an attempt, in plain words: the reasons of the gate and
 * how its tests failed, the checks it passed, or why it stopped before a
 * verdict. A running attempt has no result yet.
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
      return [
        ...report.reasons.map((text) => ({ text })),
        ...failureResults(report),
      ];
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
