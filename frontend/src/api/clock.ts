/**
 * The moment now, in the one format of the contract,
 * `YYYY-MM-DDTHH:mm:ss.sssZ`. This is the only place of the client that
 * reads the clock: everything else is given a moment, so a test decides
 * what the time is.
 */
export function currentMoment(): string {
  return Temporal.Now.instant().toString({ smallestUnit: 'millisecond' });
}

/** The time zone of the user, such as `Europe/Prague`, to show moments in. */
export function localTimeZone(): string {
  return Temporal.Now.timeZoneId();
}
