import { Injectable } from '@nestjs/common';

import type { Clock } from '#kernel/time/clock';
import { Instant } from '#kernel/time/instant';

/**
 * The only place that reads the real time. The moment the process started
 * plus the time it has run is the time now, with no `Date` of the
 * language anywhere in the service.
 */
@Injectable()
export class SystemClock implements Clock {
  public now(): Instant {
    return Instant.fromEpochMilliseconds(
      Math.floor(performance.timeOrigin + performance.now()),
    );
  }
}
