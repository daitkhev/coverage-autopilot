import { describe, expect, it } from 'vitest';

import { FixedClock } from '#tests/support/fixed-clock';
import { NOW } from '#tests/support/verification-requests';
import { Stopwatch } from '#verification/application/stopwatch';

describe('Stopwatch', () => {
  it('should measure the time of the clock since it started', () => {
    const clock = new FixedClock(NOW);
    const stopwatch = Stopwatch.started(clock);

    clock.advance(1234);

    expect(stopwatch.elapsedMs()).toBe(1234);
  });
});
