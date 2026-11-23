import type { Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';

/** A tool is never given less: a limit of zero would stop it at once. */
const LEAST_LIMIT_MS = 1;

/**
 * The moment the work of one call must end, read against the clock. A
 * step is given what is left of it, and never more than its own limit.
 */
export class Deadline {
  private readonly clock: Clock;
  private readonly moment: Instant;

  public constructor(clock: Clock, moment: Instant) {
    this.clock = clock;
    this.moment = moment;
  }

  public hasPassed(): boolean {
    return !this.clock.now().isBefore(this.moment);
  }

  /** The time limit of a step: its own, or what is left when that is less. */
  public limit(stepLimitMs: number): number {
    const leftMs =
      this.moment.epochMilliseconds - this.clock.now().epochMilliseconds;
    return Math.max(LEAST_LIMIT_MS, Math.min(stepLimitMs, leftMs));
  }
}
