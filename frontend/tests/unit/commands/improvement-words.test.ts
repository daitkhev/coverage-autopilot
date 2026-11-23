import { describe, expect, it } from 'vitest';

import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { attemptLine, statusWords } from '#commands/improvement-words';
import {
  ACCEPTED_ATTEMPT,
  OPEN_ATTEMPT,
  REJECTED_ATTEMPT,
} from '#tests/support/sample-attempts';
import { recordingIo } from '#tests/support/sample-command-io';
import { IMPROVEMENT_BY_STATUS as BY_STATUS } from '#tests/support/sample-improvements';

const IO = recordingIo({});

function reportOf(attempt: Attempt): VerificationReport {
  if (attempt.report === null) {
    throw new Error(
      `The sample attempt ${String(attempt.number)} has no report.`,
    );
  }
  return attempt.report;
}

describe('statusWords', () => {
  it.each<[Improvement, string]>([
    [BY_STATUS.created, '○ WAIT  waits for its repository'],
    [BY_STATUS.analyzing, '⠋ RUN  analyzing'],
    [BY_STATUS.generating, '⠋ RUN  attempt 2 of 3, writing a test'],
    [BY_STATUS.waiting_for_limit, '○ WAIT  waits for the limit until 16:00'],
    [BY_STATUS.verifying, '⠋ RUN  attempt 2 of 3, check 5 of 7'],
    [BY_STATUS.awaiting_approval, '? REVIEW  approve the patch'],
    [BY_STATUS.publishing, '⠋ RUN  publishing'],
    [
      BY_STATUS.completed,
      '✓ DONE  https://github.com/example/payments/pull/131',
    ],
    [BY_STATUS.failed, '✕ FAIL  3 attempts were rejected. (budget_exhausted)'],
    [
      BY_STATUS.skipped,
      '– SKIP  The fresh measurement is already above the threshold. (threshold_met)',
    ],
    [BY_STATUS.cancelled, '■ CANCEL  cancelled at 14:01'],
  ])('should say %o as the status table does', (improvement, words) => {
    expect(statusWords(improvement, IO)).toBe(words);
  });

  describe('when the service says nothing beside the status', () => {
    it.each<[Improvement, string]>([
      [
        { ...BY_STATUS.created, waitingFor: null },
        '○ WAIT  waits for its turn',
      ],
      [{ ...BY_STATUS.completed, pullRequest: null }, '✓ DONE'],
      [{ ...BY_STATUS.failed, failure: null }, '✕ FAIL'],
      [{ ...BY_STATUS.skipped, skip: null }, '– SKIP'],
      [{ ...BY_STATUS.cancelled, cancelledAt: null }, '■ CANCEL  cancelled'],
    ])('should say only what it knows of %o', (improvement, words) => {
      expect(statusWords(improvement, IO)).toBe(words);
    });
  });
});

describe('attemptLine', () => {
  it.each<[Attempt, string]>([
    [
      REJECTED_ATTEMPT,
      'attempt 1    rejected: The new tests detect 0 of 14 mutants.',
    ],
    [
      ACCEPTED_ATTEMPT,
      'attempt 1    accepted: lines 88.2%, 11 of 14 mutants detected',
    ],
    [OPEN_ATTEMPT, 'attempt 2    running'],
    [
      { ...OPEN_ATTEMPT, status: 'closed', generationOutcome: 'no_changes' },
      'attempt 2    no verdict: the generator changed nothing (no_changes)',
    ],
  ])('should say %o by its verdict', (attempt, line) => {
    expect(attemptLine(attempt)).toBe(line);
  });

  describe('when the gate could not finish a check', () => {
    it('should say that the patch runs again, and why', () => {
      const report: VerificationReport = {
        ...reportOf(REJECTED_ATTEMPT),
        verdict: 'inconclusive',
        reasons: ['The type check timed out.'],
      };

      expect(attemptLine({ ...REJECTED_ATTEMPT, report })).toBe(
        'attempt 1    runs again: The type check timed out.',
      );
    });
  });

  describe('when an accepted patch has no numbers', () => {
    it('should say only its verdict', () => {
      const report: VerificationReport = {
        ...reportOf(ACCEPTED_ATTEMPT),
        coverageAfter: null,
        mutants: null,
      };

      expect(attemptLine({ ...ACCEPTED_ATTEMPT, report })).toBe(
        'attempt 1    accepted',
      );
    });
  });
});
