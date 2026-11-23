import { Injectable } from '@nestjs/common';

import type { Clock } from '#kernel/time/clock';
import { Instant } from '#kernel/time/instant';

/**
 * The only place of the service that reads the real time: the clock of
 * the platform, cut to whole milliseconds. No `Date` of the language is
 * anywhere in the service.
 */
@Injectable()
export class SystemClock implements Clock {
  public now(): Instant {
    return Instant.fromEpochMilliseconds(
      Temporal.Now.instant().epochMilliseconds,
    );
  }
}
