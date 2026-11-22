import { describe, expect, it } from 'vitest';

import { waitEndOf } from '#improvement/application/commands/run-improvement/generation-wait';
import type { Instant } from '#kernel/time/instant';
import { windowSpent } from '#tests/support/improvement-generation-results';
import { minutesIn } from '#tests/support/improvement-values';

const NOW = minutesIn(10);
const WAIT_MS = 3_600_000;

/** A spent window the generator named no moment for, as it last saw it. */
function resettingAt(resetsAt: Instant | null) {
  return windowSpent(null, {
    fiveHour: resetsAt === null ? null : { utilization: 1, resetsAt },
    sevenDay: { utilization: 0.4, resetsAt: minutesIn(5000) },
  });
}

describe('waitEndOf', () => {
  it('should wait until the moment the generator said the window opens', () => {
    const window = { ...resettingAt(minutesIn(40)), resumesAt: minutesIn(90) };

    expect(waitEndOf(window, NOW, WAIT_MS)).toEqual(minutesIn(90));
  });

  describe('when the generator did not say when the window opens', () => {
    it('should wait until the five-hour window it last reported resets', () => {
      expect(waitEndOf(resettingAt(minutesIn(40)), NOW, WAIT_MS)).toEqual(
        minutesIn(40),
      );
    });

    it('should wait as long as the settings say once that reset has come', () => {
      expect(waitEndOf(resettingAt(NOW), NOW, WAIT_MS)).toEqual(minutesIn(70));
      expect(waitEndOf(resettingAt(minutesIn(9)), NOW, WAIT_MS)).toEqual(
        minutesIn(70),
      );
    });

    it('should wait as long as the settings say when no five-hour window was named', () => {
      expect(waitEndOf(resettingAt(null), NOW, WAIT_MS)).toEqual(minutesIn(70));
      expect(waitEndOf(windowSpent(null), NOW, WAIT_MS)).toEqual(minutesIn(70));
    });
  });
});
