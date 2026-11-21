import { describe, expect, it } from 'vitest';

import { Attempt } from '#improvement/domain/entities/attempt.entity';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  acceptedOf,
  closedCountOf,
  lastRejectedOf,
  openAttemptOf,
  requireOpenAttempt,
  withAttempt,
} from '#improvement/domain/services/attempt-list.service';
import type { Verdict } from '#improvement/domain/value-objects/verification-report.vo';
import {
  CREATED_AT,
  minutesIn,
  patchOf,
  reportOf,
} from '#tests/support/improvement-values';

function judged(number: number, verdict: Verdict, digit: string): Attempt {
  return Attempt.open(number, CREATED_AT)
    .withPatch(patchOf(digit))
    .withReport(reportOf(verdict, digit), minutesIn(number));
}

const OPEN = Attempt.open(3, minutesIn(3));

/** Two rejected attempts and an open one, as a run after a crash finds. */
const RETRIED = [judged(1, 'rejected', 'a'), judged(2, 'rejected', 'b'), OPEN];

describe('openAttemptOf', () => {
  it('should find the attempt that is still open', () => {
    expect(openAttemptOf(RETRIED)).toBe(OPEN);
  });

  it('should find none among closed attempts', () => {
    expect(openAttemptOf(RETRIED.slice(0, -1))).toBeNull();
    expect(openAttemptOf([])).toBeNull();
  });
});

describe('requireOpenAttempt', () => {
  it('should give the open attempt', () => {
    expect(requireOpenAttempt(RETRIED)).toBe(OPEN);
  });

  describe('when no attempt is open', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() => requireOpenAttempt([])).toThrow(
        new InvalidTransitionError('The improvement has no open attempt.'),
      );
    });
  });
});

describe('withAttempt', () => {
  it('should put the changed attempt in the place of its number', () => {
    const changed = OPEN.withPatch(patchOf('c'));

    expect(withAttempt(RETRIED, changed)).toEqual([
      RETRIED[0],
      RETRIED[1],
      changed,
    ]);
  });
});

describe('closedCountOf', () => {
  it('should count the attempts that are over', () => {
    expect(closedCountOf(RETRIED)).toBe(2);
    expect(closedCountOf([])).toBe(0);
  });
});

describe('lastRejectedOf', () => {
  it('should find the last attempt the gate rejected', () => {
    expect(lastRejectedOf(RETRIED)?.number).toBe(2);
  });

  it('should find none before the gate rejected one', () => {
    expect(lastRejectedOf([OPEN])).toBeNull();
  });
});

describe('acceptedOf', () => {
  it('should find the attempt whose patch the gate accepted', () => {
    const attempts = [judged(1, 'rejected', 'a'), judged(2, 'accepted', 'b')];

    expect(acceptedOf(attempts)?.patch).toEqual(patchOf('b'));
  });

  it('should find none while the gate accepted nothing', () => {
    expect(acceptedOf(RETRIED)).toBeNull();
  });
});
