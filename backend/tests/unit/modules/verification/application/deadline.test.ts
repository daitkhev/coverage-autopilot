import { describe, expect, it } from 'vitest';

import { Instant } from '#kernel/time/instant';
import { FixedClock } from '#tests/support/fixed-clock';
import { DEADLINE, HOUR_MS, NOW } from '#tests/support/verification-requests';
import { Deadline } from '#verification/application/deadline';

function deadlineAtOneHour(): { clock: FixedClock; deadline: Deadline } {
  const clock = new FixedClock(NOW);
  return { clock, deadline: new Deadline(clock, Instant.parse(DEADLINE)) };
}

describe('Deadline', () => {
  describe('hasPassed', () => {
    it('should pass at the moment itself and not before', () => {
      const { clock, deadline } = deadlineAtOneHour();

      expect(deadline.hasPassed()).toBe(false);
      clock.advance(HOUR_MS);
      expect(deadline.hasPassed()).toBe(true);
    });
  });

  describe('limit', () => {
    it('should give a step its own limit while more time is left', () => {
      const { deadline } = deadlineAtOneHour();

      expect(deadline.limit(60_000)).toBe(60_000);
    });

    it('should give a step what is left when that is less', () => {
      const { clock, deadline } = deadlineAtOneHour();
      clock.advance(HOUR_MS - 5000);

      expect(deadline.limit(60_000)).toBe(5000);
    });

    describe('when no time is left', () => {
      it('should give the least limit a tool can take', () => {
        const { clock, deadline } = deadlineAtOneHour();
        clock.advance(HOUR_MS + 1);

        expect(deadline.limit(60_000)).toBe(1);
      });
    });
  });
});
