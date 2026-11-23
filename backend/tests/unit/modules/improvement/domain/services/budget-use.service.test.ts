import { describe, expect, it } from 'vitest';

import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  allowanceOf,
  usageOf,
} from '#improvement/domain/services/budget-use.service';
import {
  improvementIn,
  type JourneySpec,
  STEP_MINUTE,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import {
  budgetOf,
  minutesIn,
  reportOf,
} from '#tests/support/improvement-values';

const SECONDS_PER_MINUTE = 60;

/** The tokens each call of the generator in the journeys spends. */
const CALL_TOKENS = 1500;

function usedMinutes(minutes: number): number {
  return minutes * SECONDS_PER_MINUTE;
}

/** An improvement whose first patch the gate rejected at minute 6. */
function rejectedOnce(spec: JourneySpec = {}): Improvement {
  const improvement = improvementIn('verifying', spec);
  improvement.recordVerdict(
    reportOf('rejected'),
    minutesIn(STEP_MINUTE.judged),
  );
  return improvement;
}

describe('usageOf', () => {
  it('should be empty before the work starts', () => {
    const usage = usageOf(improvementIn('created').state, minutesIn(20));

    expect([usage.attempts, usage.tokens, usage.seconds]).toEqual([0, 0, 0]);
  });

  it('should count the time of work up to now while it works', () => {
    const usage = usageOf(improvementIn('generating').state, minutesIn(10));

    expect(usage.seconds).toBe(usedMinutes(10 - STEP_MINUTE.started));
  });

  it('should count the open attempt and the tokens it spent', () => {
    const usage = usageOf(improvementIn('verifying').state, minutesIn(10));

    expect([usage.attempts, usage.tokens]).toEqual([1, CALL_TOKENS]);
  });

  it('should count no time while it waits for a window', () => {
    const usage = usageOf(
      improvementIn('waiting_for_limit').state,
      minutesIn(40),
    );

    expect(usage.seconds).toBe(
      usedMinutes(STEP_MINUTE.generated - STEP_MINUTE.started),
    );
  });

  it('should count the time before and after a wait, and not the wait', () => {
    const improvement = improvementIn('waiting_for_limit');
    improvement.resume(WINDOW_OPENS_AT);
    const after = 2;

    const usage = usageOf(
      improvement.state,
      minutesIn(STEP_MINUTE.windowOpens + after),
    );

    expect(usage.seconds).toBe(
      usedMinutes(STEP_MINUTE.generated - STEP_MINUTE.started + after),
    );
  });

  it('should stop counting time once the improvement is over', () => {
    const usage = usageOf(improvementIn('failed').state, minutesIn(50));

    expect(usage.seconds).toBe(
      usedMinutes(STEP_MINUTE.measured - STEP_MINUTE.started),
    );
  });
});

describe('allowanceOf', () => {
  it('should allow generation while each limit has some left', () => {
    expect(
      allowanceOf(improvementIn('generating').state, minutesIn(10)),
    ).toEqual({ allowed: true });
  });

  it('should let the open attempt of a run after a crash finish', () => {
    const state = improvementIn('verifying', {
      budget: budgetOf({ attempts: 1 }),
    }).state;

    expect(allowanceOf(state, minutesIn(10))).toEqual({ allowed: true });
  });

  describe('when a limit is reached', () => {
    it('should name the attempts once every attempt is over', () => {
      const improvement = rejectedOnce({ budget: budgetOf({ attempts: 1 }) });

      expect(allowanceOf(improvement.state, minutesIn(10))).toEqual({
        allowed: false,
        spent: 'attempts',
      });
    });

    it('should name the tokens once a key spent its limit', () => {
      const improvement = rejectedOnce({
        billing: 'api_key',
        budget: budgetOf({ tokens: CALL_TOKENS }),
      });

      expect(allowanceOf(improvement.state, minutesIn(10))).toEqual({
        allowed: false,
        spent: 'tokens',
      });
    });

    it('should name the minutes once the deadline passed', () => {
      expect(
        allowanceOf(improvementIn('generating').state, minutesIn(40)),
      ).toEqual({ allowed: false, spent: 'minutes' });
    });
  });
});
