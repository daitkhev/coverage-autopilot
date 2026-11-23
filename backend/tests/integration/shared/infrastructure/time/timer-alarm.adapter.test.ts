import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimerAlarm } from '#infrastructure/time/timer-alarm.adapter';
import { FixedClock } from '#tests/support/fixed-clock';

const START = '2026-11-21T10:00:00.000Z';

const WAIT_MS = 60_000;

/** The longest delay a timer of Node takes. */
const LONGEST_TIMER_MS = 2_147_483_647;

let clock: FixedClock;
let alarm: TimerAlarm;
let rings: number;

/** The clock and the timers of the runtime move together, as they do. */
function pass(milliseconds: number): void {
  clock.advance(milliseconds);
  vi.advanceTimersByTime(milliseconds);
}

function setIn(milliseconds: number): () => void {
  return alarm.set(clock.now().plusMilliseconds(milliseconds), () => {
    rings += 1;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = new FixedClock(START);
  alarm = new TimerAlarm(clock);
  rings = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimerAlarm', () => {
  describe('set', () => {
    it('should ring once when the moment comes', () => {
      setIn(WAIT_MS);

      pass(WAIT_MS - 1);

      expect(rings).toBe(0);

      pass(1);
      pass(WAIT_MS);

      expect(rings).toBe(1);
    });

    it('should ring at the next turn for a moment that has passed', () => {
      setIn(-WAIT_MS);

      expect(rings).toBe(0);

      pass(0);

      expect(rings).toBe(1);
    });

    it('should not ring once it was taken back', () => {
      const cancel = setIn(WAIT_MS);

      cancel();
      pass(WAIT_MS);

      expect(rings).toBe(0);
    });

    describe('when a timer fires before the clock reached the moment', () => {
      it('should wait for the clock', () => {
        setIn(WAIT_MS);

        vi.advanceTimersByTime(WAIT_MS);

        expect(rings).toBe(0);

        pass(WAIT_MS);

        expect(rings).toBe(1);
      });
    });

    describe('when the moment is further than a timer can wait', () => {
      it('should ring at the moment and not before', () => {
        setIn(LONGEST_TIMER_MS + WAIT_MS);

        pass(LONGEST_TIMER_MS);
        pass(WAIT_MS - 1);

        expect(rings).toBe(0);

        pass(1);

        expect(rings).toBe(1);
      });
    });
  });
});
