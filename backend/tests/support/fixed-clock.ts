import type { Clock } from '#kernel/time/clock';
import { Instant } from '#kernel/time/instant';

/**
 * A clock that stands still until a test moves it, so a lease or a
 * deadline runs out exactly when the test says.
 */
export class FixedClock implements Clock {
  private moment: Instant;

  public constructor(start: string) {
    this.moment = Instant.parse(start);
  }

  public now(): Instant {
    return this.moment;
  }

  public advance(milliseconds: number): void {
    this.moment = this.moment.plusMilliseconds(milliseconds);
  }
}
