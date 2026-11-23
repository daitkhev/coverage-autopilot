import { describe, expect, expectTypeOf, it } from 'vitest';

import { CLOCK } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import { ALARM, type Alarm, type AlarmCancel } from '#ports/alarm.port';

describe('Alarm', () => {
  it('should be injected by a token of its own', () => {
    expect(ALARM.description).toBe('Alarm');
    expect(ALARM).not.toBe(CLOCK);
  });

  it('should take a moment and what to call, and give the way to take it back', () => {
    expectTypeOf<Alarm['set']>().parameter(0).toEqualTypeOf<Instant>();
    expectTypeOf<Alarm['set']>().parameter(1).toEqualTypeOf<() => void>();
    expectTypeOf<Alarm['set']>().returns.toEqualTypeOf<AlarmCancel>();
  });
});
