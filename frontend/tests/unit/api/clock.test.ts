import { describe, expect, it } from 'vitest';

import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { timestampSchema } from '@coverage-autopilot/api-contracts/values';

import { currentMoment, localTimeZone } from '#api/clock';

const MOMENT = '2026-11-21T14:05:00.000Z';

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
});

describe('localTimeZone', () => {
  it('should name a zone a moment can be shown in', () => {
    const zone = localTimeZone();
    const shown = Temporal.Instant.from(MOMENT).toZonedDateTimeISO(zone);

    expect(shown.timeZoneId).toBe(zone);
  });
});
