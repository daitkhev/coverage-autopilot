import type { Instant } from '#kernel/time/instant';
import type { Alarm, AlarmCancel } from '#ports/alarm.port';
import type { FixedClock } from '#tests/support/fixed-clock';

/**
 * An alarm that moves a fixed clock to its moment and rings at the next
 * turn, so a wait takes no time and the clock tells how long it was. It
 * keeps the moment of every alarm, and what was taken back rings not.
 */
export class SteppingAlarm implements Alarm {
  public readonly moments: Instant[] = [];
  private readonly clock: FixedClock;

  public constructor(clock: FixedClock) {
    this.clock = clock;
  }

  public set(moment: Instant, ring: () => void): AlarmCancel {
    this.moments.push(moment);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        const left =
          moment.epochMilliseconds - this.clock.now().epochMilliseconds;
        this.clock.advance(Math.max(left, 0));
        ring();
      }
    });
    return () => {
      cancelled = true;
    };
  }
}
