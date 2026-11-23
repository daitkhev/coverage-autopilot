import { describe, expect, it } from 'vitest';

import {
  ageWords,
  clockWords,
  dayWords,
  durationWords,
  elapsedMs,
  isOlderThan,
  STALE_AFTER_MS,
} from '#theme/moments';

const NOW = '2026-11-21T14:05:00.000Z';

describe('elapsedMs', () => {
  it('should count the milliseconds from one moment to the next', () => {
    expect(elapsedMs('2026-11-21T14:04:58.750Z', NOW)).toBe(1250);
  });

  it('should be negative to an earlier moment', () => {
    expect(elapsedMs(NOW, '2026-11-21T14:04:59.000Z')).toBe(-1000);
  });
});

describe('ageWords', () => {
  it.each([
    ['2026-11-21T14:05:00.000Z', '0s'],
    ['2026-11-21T14:04:55.400Z', '4s'],
    ['2026-11-21T14:04:00.001Z', '59s'],
    ['2026-11-21T14:04:00.000Z', '1m'],
    ['2026-11-21T13:53:00.000Z', '12m'],
    ['2026-11-21T13:05:00.000Z', '1h'],
    ['2026-11-21T11:05:00.000Z', '3h'],
    ['2026-11-20T14:05:00.000Z', '1d'],
    ['2026-11-19T10:05:00.000Z', '2d'],
  ])('should say a moment of %s as %s old', (then, words) => {
    expect(ageWords(then, NOW)).toBe(words);
  });

  describe('when the moment is ahead of now', () => {
    it('should say it is no age at all', () => {
      expect(ageWords('2026-11-21T14:05:03.000Z', NOW)).toBe('0s');
    });
  });
});

describe('durationWords', () => {
  it.each([
    [0, '0.0s'],
    [230, '0.2s'],
    [999, '0.9s'],
    [1000, '1s'],
    [12_900, '12s'],
    [59_999, '59s'],
    [60_000, '1m 00s'],
    [65_000, '1m 05s'],
    [661_000, '11m 01s'],
    [3_599_999, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_840_000, '1h 04m'],
    [11_520_000, '3h 12m'],
    [97_200_000, '27h 00m'],
  ])('should say %i ms as %s', (milliseconds, words) => {
    expect(durationWords(milliseconds)).toBe(words);
  });

  describe('when the time is negative', () => {
    it('should say no time passed', () => {
      expect(durationWords(-5)).toBe('0.0s');
    });
  });
});

describe('clockWords', () => {
  it('should say the time of day in the zone of the user', () => {
    expect(clockWords(NOW, 'UTC')).toBe('14:05');
    expect(clockWords(NOW, 'Europe/Prague')).toBe('15:05');
    expect(clockWords(NOW, 'America/New_York')).toBe('09:05');
  });
});

describe('dayWords', () => {
  it('should say the day in the zone of the user', () => {
    expect(dayWords('2026-11-21T23:30:00.000Z', 'UTC')).toBe('2026-11-21');
    expect(dayWords('2026-11-21T23:30:00.000Z', 'Europe/Prague')).toBe(
      '2026-11-22',
    );
  });
});

describe('isOlderThan', () => {
  it('should hold a moment past the given time as old', () => {
    expect(isOlderThan('2026-11-21T14:04:49.999Z', NOW, STALE_AFTER_MS)).toBe(
      true,
    );
  });

  it('should hold a moment of exactly the given time as not yet old', () => {
    expect(isOlderThan('2026-11-21T14:04:50.000Z', NOW, STALE_AFTER_MS)).toBe(
      false,
    );
  });

  it('should take ten seconds for the steps of running work', () => {
    expect(STALE_AFTER_MS).toBe(10_000);
  });
});
