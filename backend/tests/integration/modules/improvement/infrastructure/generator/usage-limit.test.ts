import { describe, expect, it } from 'vitest';

import type { RateLimitInfo } from '#improvement/infrastructure/generator/claude-stream.schema';
import {
  spentLimitOf,
  windowsOf,
} from '#improvement/infrastructure/generator/usage-limit';
import { Instant } from '#kernel/time/instant';
import { RESET_SECONDS, TEST_NOW } from '#tests/support/generator-stream';

const NOW = Instant.parse(TEST_NOW);
const RESET = Instant.fromEpochMilliseconds(RESET_SECONDS * 1000);

const WINDOW = { utilization: 0.3, resetsAt: RESET_SECONDS };

describe('spentLimitOf', () => {
  it('should answer nothing spent without a state of the limits', () => {
    expect(spentLimitOf(null, NOW)).toBeNull();
  });

  it.each(['allowed', 'allowed_warning', 'a status of a later version'])(
    'should answer nothing spent for %s',
    (status) => {
      expect(
        spentLimitOf({ status, rateLimitType: 'five_hour' }, NOW),
      ).toBeNull();
    },
  );

  it.each<[string, RateLimitInfo, Instant | null]>([
    [
      'the moment of the limit',
      {
        status: 'rejected',
        rateLimitType: 'five_hour',
        resetsAt: RESET_SECONDS,
      },
      RESET,
    ],
    [
      'the moment of the window',
      {
        status: 'rejected',
        rateLimitType: 'five_hour',
        resetsAt: null,
        unifiedWindows: { five_hour: WINDOW },
      },
      RESET,
    ],
    ['no moment', { status: 'rejected', rateLimitType: 'five_hour' }, null],
    [
      'now for a moment past',
      { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 0 },
      NOW,
    ],
  ])(
    'should wait for a spent five-hour window until %s',
    (_, info, resumesAt) => {
      expect(spentLimitOf(info, NOW)).toEqual({
        outcome: 'window_exhausted',
        resumesAt,
      });
    },
  );

  it.each([['seven_day'], ['seven_day_opus'], ['overage'], [null]])(
    'should end the improvement for a spent limit %s',
    (rateLimitType) => {
      expect(spentLimitOf({ status: 'rejected', rateLimitType }, NOW)).toEqual({
        outcome: 'quota_exhausted',
      });
    },
  );
});

describe('windowsOf', () => {
  it('should answer null when the CLI named no window', () => {
    expect(windowsOf(null)).toBeNull();
    expect(windowsOf({ status: 'allowed' })).toBeNull();
    expect(
      windowsOf({
        status: 'allowed',
        unifiedWindows: { five_hour: null, seven_day: null },
      }),
    ).toBeNull();
  });

  it('should give each window it named, and null for the other', () => {
    expect(
      windowsOf({ status: 'allowed', unifiedWindows: { seven_day: WINDOW } }),
    ).toEqual({
      fiveHour: null,
      sevenDay: { utilization: 0.3, resetsAt: RESET },
    });
  });

  it('should keep a share above the whole at the whole', () => {
    expect(
      windowsOf({
        status: 'rejected',
        unifiedWindows: { five_hour: { ...WINDOW, utilization: 1.5 } },
      })?.fiveHour?.utilization,
    ).toBe(1);
  });
});
