import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import type { Alarm, AlarmCancel } from '#ports/alarm.port';

/** A timer of Node takes no longer delay: a longer one fires at once. */
const LONGEST_TIMER_MS = 2_147_483_647;

/**
 * The alarm on the timers of Node. They are the global ones, which the
 * fake timers of a test replace. A timer measures time on its own, so a
 * timer that fires before the clock reached the moment is set again: the
 * clock decides, as it does everywhere else.
 */
@Injectable()
export class TimerAlarm implements Alarm {
  private readonly clock: Clock;

  public constructor(@Inject(CLOCK) clock: Clock) {
    this.clock = clock;
  }

  public set(moment: Instant, ring: () => void): AlarmCancel {
    let timer: NodeJS.Timeout | undefined;
    const wait = (): void => {
      const leftMs =
        moment.epochMilliseconds - this.clock.now().epochMilliseconds;
      if (leftMs <= 0 && timer !== undefined) {
        ring();
        return;
      }
      timer = setTimeout(wait, Math.min(Math.max(leftMs, 0), LONGEST_TIMER_MS));
    };
    wait();
    return () => {
      clearTimeout(timer);
    };
  }
}
