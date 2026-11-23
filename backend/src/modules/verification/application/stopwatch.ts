import type { Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';

/** The time a piece of work took, read from the clock and nowhere else. */
export class Stopwatch {
  private readonly clock: Clock;
  private readonly start: Instant;

  private constructor(clock: Clock) {
    this.clock = clock;
    this.start = clock.now();
  }

  public static started(clock: Clock): Stopwatch {
    return new Stopwatch(clock);
  }

  public elapsedMs(): number {
    return this.clock.now().epochMilliseconds - this.start.epochMilliseconds;
  }
}
