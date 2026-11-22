/// <reference lib="esnext.temporal" />

import { describe, expect, it } from 'vitest';

import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { timestampSchema } from '@coverage-autopilot/api-contracts/values';

import { currentMoment, localTimeZone } from '#api/clock';

describe('the platform', () => {
  it('should have Temporal, which the client reads the clock with', () => {
    expect(globalThis).toHaveProperty('Temporal.Now.instant');
  });
});

describe('currentMoment', () => {
  it('should write the moment in the one format of the contract', () => {
    const moment = currentMoment();

    expect(parseAs(timestampSchema, moment)).toBe(moment);
  });

  it('should read the clock now', () => {
    const before = Temporal.Now.instant().epochMilliseconds;
    const moment = Temporal.Instant.from(currentMoment()).epochMilliseconds;
    const after = Temporal.Now.instant().epochMilliseconds;

    expect(moment).toBeGreaterThanOrEqual(before);
    expect(moment).toBeLessThanOrEqual(after);
  });
});

describe('localTimeZone', () => {
  it('should name a zone a moment can be shown in', () => {
    const zone = localTimeZone();

    expect(Temporal.Now.zonedDateTimeISO(zone).timeZoneId).toBe(zone);
  });
});
