import { describe, expect, it } from 'vitest';

import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { BudgetSpentError } from '#improvement/domain/errors/budget-spent.error';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { PatchIntegrityError } from '#improvement/domain/errors/patch-integrity.error';
import {
  afterGeneration,
  failedAfterCall,
  MAX_LIMIT_WAITS,
  resumed,
  withAttemptOpened,
} from '#improvement/domain/services/generation.service';
import {
  failureOf,
  improvementIn,
  STEP_MINUTE,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import {
  budgetOf,
  endedWith,
  generatedOf,
  minutesIn,
  patchOf,
  reportOf,
  windowSpentUntil,
} from '#tests/support/improvement-values';

const AT = minutesIn(10);

/** Generating, with the first attempt open and nothing generated yet. */
function withOpenAttempt(): ImprovementState {
  const improvement = improvementIn('generating');
  improvement.openAttempt(minutesIn(STEP_MINUTE.attemptOpened));
  return improvement.state;
}

function rejected(attempts: number): ImprovementState {
  const improvement = improvementIn('verifying', {
    budget: budgetOf({ attempts }),
  });
  improvement.recordVerdict(
    reportOf('rejected'),
    minutesIn(STEP_MINUTE.judged),
  );
  return improvement.state;
}

describe('withAttemptOpened', () => {
  it('should open the first attempt and start its phase', () => {
    const state = withAttemptOpened(improvementIn('generating').state, AT);

    expect(state.attempts.map((attempt) => attempt.number)).toEqual([1]);
    expect(state.attempts[0]?.startedAt).toEqual(AT);
    expect([state.phaseStartedAt, state.updatedAt]).toEqual([AT, AT]);
  });

  it('should give back the open attempt to a run after a crash', () => {
    const state = withOpenAttempt();

    expect(withAttemptOpened(state, AT)).toBe(state);
  });

  it('should open the next attempt after a rejected patch', () => {
    const state = withAttemptOpened(rejected(2), AT);

    expect(state.attempts.map((attempt) => attempt.isOpen)).toEqual([
      false,
      true,
    ]);
  });

  describe('when the budget allows no other attempt', () => {
    it('should throw BudgetSpentError that a rerun does not help', () => {
      const open = (): unknown => withAttemptOpened(rejected(1), AT);

      expect(open).toThrow(
        new BudgetSpentError(
          'The budget of attempts is spent, so no attempt opens.',
        ),
      );
      expect(open).toThrow(
        expect.objectContaining({ code: 'budget_spent', retryable: false }),
      );
    });
  });

  describe('when the improvement does not generate', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        withAttemptOpened(improvementIn('waiting_for_limit').state, AT),
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('afterGeneration', () => {
  it('should keep the patch and its call and move to the gate', () => {
    const state = afterGeneration(withOpenAttempt(), generatedOf(), AT);
    const [attempt] = state.attempts;

    expect(state.status).toBe('verifying');
    expect(attempt?.patch).toEqual(patchOf());
    expect(attempt?.tokensUsed).toBe(generatedOf().tokensUsed);
    expect(attempt?.outputReferences).toEqual(['outputs/generator.json']);
    expect(attempt?.isOpen).toBe(true);
  });

  it('should change nothing when a run after a crash brings the same patch', () => {
    const state = improvementIn('verifying').state;

    expect(afterGeneration(state, generatedOf(), AT)).toBe(state);
  });

  describe('when a run after a crash brings another patch', () => {
    it('should throw PatchIntegrityError', () => {
      expect(() =>
        afterGeneration(improvementIn('verifying').state, generatedOf('b'), AT),
      ).toThrow(PatchIntegrityError);
    });
  });

  it.each(['no_changes', 'limit_reached'] as const)(
    'should close the attempt after %s without the gate and count its tokens',
    (outcome) => {
      const state = afterGeneration(withOpenAttempt(), endedWith(outcome), AT);
      const [attempt] = state.attempts;

      expect(state.status).toBe('generating');
      expect(state.updatedAt).toEqual(AT);
      expect([attempt?.outcome, attempt?.finishedAt]).toEqual([outcome, AT]);
      expect(attempt?.tokensUsed).toBe(endedWith(outcome).tokensUsed);
    },
  );

  it('should fail at once when the account has no usage left', () => {
    const state = afterGeneration(
      withOpenAttempt(),
      endedWith('quota_exhausted'),
      AT,
    );

    expect(state.status).toBe('failed');
    expect(state.failure?.reason).toBe('quota_exhausted');
    expect(state.failure?.message).toBe(
      'The account of the generator has no usage left, and a few hours of ' +
        'waiting would not bring it back.',
    );
    expect(state.attempts[0]?.isOpen).toBe(false);
  });

  it('should fail at once and keep no patch when a credential was exposed', () => {
    const state = afterGeneration(
      withOpenAttempt(),
      endedWith('credential_exposed'),
      AT,
    );

    expect(state.failure?.reason).toBe('credential_exposed');
    expect(state.failure?.message).toBe(
      'A file the generator changed held its credential, so nothing it ' +
        'wrote was kept.',
    );
    expect(state.attempts[0]?.patch).toBeNull();
  });

  it('should wait for a spent window with the same attempt open', () => {
    const state = afterGeneration(
      withOpenAttempt(),
      windowSpentUntil(WINDOW_OPENS_AT),
      AT,
    );

    expect(state.status).toBe('waiting_for_limit');
    expect([state.resumesAt, state.limitWaits]).toEqual([WINDOW_OPENS_AT, 1]);
    expect(state.attempts.map((attempt) => attempt.isOpen)).toEqual([true]);
  });

  describe('when the window is spent a third time', () => {
    it('should fail the improvement instead of waiting again', () => {
      const opening = Array.from({ length: MAX_LIMIT_WAITS }, (_, index) =>
        minutesIn(STEP_MINUTE.windowOpens * (index + 1)),
      );
      const waitedTwice = opening.reduce((current, opensAt) => {
        const spent = windowSpentUntil(opensAt);
        return resumed(
          afterGeneration(current, spent, current.updatedAt),
          opensAt,
        );
      }, withOpenAttempt());

      const ended = afterGeneration(
        waitedTwice,
        windowSpentUntil(minutesIn(STEP_MINUTE.windowOpens * 3)),
        waitedTwice.updatedAt,
      );

      expect(MAX_LIMIT_WAITS).toBe(2);
      expect(ended.status).toBe('failed');
      expect(ended.failure?.reason).toBe('quota_exhausted');
      expect(ended.failure?.message).toBe(
        'The five-hour window of the subscription was spent a third time.',
      );
    });
  });

  describe('when no attempt is open or the improvement does not generate', () => {
    it.each([
      [
        improvementIn('generating').state,
        'The improvement has no open attempt.',
      ],
      [
        improvementIn('analyzing').state,
        'The improvement is analyzing, and this step is for one that is ' +
          'generating.',
      ],
    ])('should throw InvalidTransitionError', (state, message) => {
      expect(() => afterGeneration(state, endedWith('no_changes'), AT)).toThrow(
        new InvalidTransitionError(message),
      );
    });
  });
});

describe('failedAfterCall', () => {
  const call = endedWith('no_changes');
  const unusable = { call, failure: failureOf() };

  it('should keep what the call spent with the attempt and fail', () => {
    const state = failedAfterCall(withOpenAttempt(), unusable, AT);

    const [attempt] = state.attempts;
    expect(state.status).toBe('failed');
    expect(state.failure).toEqual(failureOf());
    expect(attempt?.tokensUsed).toBe(call.tokensUsed);
    expect(attempt?.outputReferences).toEqual([call.outputReference]);
    expect([attempt?.outcome, attempt?.patch]).toEqual([null, null]);
    expect(attempt?.finishedAt).toEqual(AT);
  });

  describe('when no attempt is open or the improvement does not generate', () => {
    it.each([
      [
        improvementIn('generating').state,
        'The improvement has no open attempt.',
      ],
      [
        improvementIn('verifying').state,
        'The improvement is verifying, and this step is for one that is ' +
          'generating.',
      ],
    ])('should throw InvalidTransitionError', (state, message) => {
      expect(() => failedAfterCall(state, unusable, AT)).toThrow(
        new InvalidTransitionError(message),
      );
    });
  });
});

describe('resumed', () => {
  it('should generate again with the same attempt once the window opens', () => {
    const state = resumed(
      improvementIn('waiting_for_limit').state,
      WINDOW_OPENS_AT,
    );

    expect(state.status).toBe('generating');
    expect(state.resumesAt).toBeNull();
    expect(state.attempts[0]?.isOpen).toBe(true);
  });

  describe('when the window is not open yet', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() =>
        resumed(improvementIn('waiting_for_limit').state, AT),
      ).toThrow(
        new InvalidTransitionError(
          `The improvement waits until ${WINDOW_OPENS_AT.toString()}.`,
        ),
      );
    });
  });

  describe('when the improvement does not wait for a window', () => {
    it('should throw InvalidTransitionError', () => {
      expect(() => resumed(improvementIn('generating').state, AT)).toThrow(
        InvalidTransitionError,
      );
    });
  });
});
