import { describe, expect, it } from 'vitest';

import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import {
  failed,
  moved,
  requireStatus,
  touched,
} from '#improvement/domain/services/status-move.service';
import {
  failureOf,
  improvementIn,
  STEP_MINUTE,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import { LIMITS, minutesIn } from '#tests/support/improvement-values';

const LATER = minutesIn(STEP_MINUTE.windowOpens);

const DEADLINE = minutesIn(STEP_MINUTE.started + LIMITS.minutes);

describe('requireStatus', () => {
  it('should let a step run in the status it is for', () => {
    expect(() => {
      requireStatus(improvementIn('analyzing').state, 'analyzing');
    }).not.toThrow();
  });

  describe('when the improvement is in another status', () => {
    it('should throw InvalidTransitionError that a rerun does not help', () => {
      const check = (): void => {
        requireStatus(improvementIn('generating').state, 'verifying');
      };

      expect(check).toThrow(
        new InvalidTransitionError(
          'The improvement is generating, and this step is for one that is ' +
            'verifying.',
        ),
      );
      expect(check).toThrow(
        expect.objectContaining({
          name: 'InvalidTransitionError',
          code: 'invalid_transition',
          retryable: false,
        }),
      );
    });
  });
});

describe('touched', () => {
  it('should move the moment of the change and nothing else', () => {
    const state = improvementIn('analyzing').state;

    expect(touched(state, LATER)).toEqual({ ...state, updatedAt: LATER });
  });
});

describe('moved', () => {
  it('should change the status and start its phase', () => {
    const state = moved(improvementIn('analyzing').state, 'skipped', LATER);

    expect(state.status).toBe('skipped');
    expect(state.phaseStartedAt).toEqual(LATER);
    expect(state.updatedAt).toEqual(LATER);
  });

  it('should keep the deadline when a status of work is left', () => {
    const state = moved(improvementIn('generating').state, 'failed', LATER);

    expect(state.deadlineAt).toEqual(DEADLINE);
  });

  it('should move the deadline later by the length of a wait that is left', () => {
    const waiting = improvementIn('waiting_for_limit').state;
    const state = moved(waiting, 'generating', WINDOW_OPENS_AT);
    const waited = STEP_MINUTE.windowOpens - STEP_MINUTE.generated;

    expect(state.deadlineAt).toEqual(
      minutesIn(STEP_MINUTE.started + LIMITS.minutes + waited),
    );
    expect(state.resumesAt).toBeNull();
  });

  it('should leave an improvement with no deadline without one', () => {
    const state = moved(improvementIn('created').state, 'cancelled', LATER);

    expect(state.deadlineAt).toBeNull();
  });

  it('should close the open attempt when the improvement ends', () => {
    const state = moved(improvementIn('verifying').state, 'cancelled', LATER);

    expect(state.attempts.map((attempt) => attempt.finishedAt)).toEqual([
      LATER,
    ]);
    expect(state.attempts[0]?.patch).not.toBeNull();
  });

  it('should keep the open attempt open while the improvement goes on', () => {
    const state = moved(
      improvementIn('waiting_for_limit').state,
      'generating',
      LATER,
    );

    expect(state.attempts[0]?.isOpen).toBe(true);
  });

  describe('when the table has no such move', () => {
    it.each([
      ['created', 'verifying'],
      ['generating', 'completed'],
      ['completed', 'cancelled'],
      ['failed', 'failed'],
    ] as const)('should refuse %s to %s', (from, to) => {
      expect(() => moved(improvementIn(from).state, to, LATER)).toThrow(
        new InvalidTransitionError(
          `An improvement that is ${from} cannot become ${to}.`,
        ),
      );
    });
  });
});

describe('failed', () => {
  it('should end the improvement with the failure', () => {
    const state = failed(improvementIn('publishing').state, failureOf(), LATER);

    expect(state.status).toBe('failed');
    expect(state.failure).toEqual(failureOf());
  });
});
