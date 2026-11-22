const TENTH_MS = 100;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const TWO_DIGITS = 2;

/** The steps of running work are drawn as old, in yellow, past this age. */
export const STALE_AFTER_MS = 10_000;

interface Unit {
  readonly ms: number;
  readonly suffix: string;
}

const SECONDS: Unit = { ms: SECOND_MS, suffix: 's' };

/** The largest first, so an age is said in the largest unit it fills. */
const AGE_UNITS: readonly Unit[] = [
  { ms: DAY_MS, suffix: 'd' },
  { ms: HOUR_MS, suffix: 'h' },
  { ms: MINUTE_MS, suffix: 'm' },
];

/** The milliseconds from one moment to another, negative to an earlier one. */
export function elapsedMs(from: string, to: string): number {
  return (
    Temporal.Instant.from(to).epochMilliseconds -
    Temporal.Instant.from(from).epochMilliseconds
  );
}

/**
 * How old a moment is, short and in one unit: `4s`, `12m`, `3h`, `2d`. A
 * moment ahead of now is said as `0s`: the clocks of the client and of
 * the service differ a little, and a negative age means nothing.
 */
export function ageWords(then: string, now: string): string {
  const age = Math.max(0, elapsedMs(then, now));
  const unit = AGE_UNITS.find((each) => age >= each.ms) ?? SECONDS;
  return `${String(Math.floor(age / unit.ms))}${unit.suffix}`;
}

function inUnits(milliseconds: number, unit: number): string {
  return String(Math.floor(milliseconds / unit));
}

function padded(milliseconds: number, unit: number): string {
  return inUnits(milliseconds, unit).padStart(TWO_DIGITS, '0');
}

/**
 * Time passed, as the mock-ups write it: `0.2s` below a second, `12s`,
 * `1m 05s`, and `1h 04m` from an hour. It is cut, never rounded up, so
 * a step is never said to have taken longer than it did.
 */
export function durationWords(milliseconds: number): string {
  const time = Math.max(0, milliseconds);
  if (time < SECOND_MS) {
    return `0.${inUnits(time, TENTH_MS)}s`;
  }
  if (time < MINUTE_MS) {
    return `${inUnits(time, SECOND_MS)}s`;
  }
  if (time < HOUR_MS) {
    return `${inUnits(time, MINUTE_MS)}m ${padded(time % MINUTE_MS, SECOND_MS)}s`;
  }
  return `${inUnits(time, HOUR_MS)}h ${padded(time % HOUR_MS, MINUTE_MS)}m`;
}

function zoned(moment: string, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(moment).toZonedDateTimeISO(timeZone);
}

/** The time of day in the zone of the user, such as `14:05`. */
export function clockWords(moment: string, timeZone: string): string {
  return zoned(moment, timeZone)
    .toPlainTime()
    .toString({ smallestUnit: 'minute' });
}

/** The day in the zone of the user, such as `2026-11-21`. */
export function dayWords(moment: string, timeZone: string): string {
  return zoned(moment, timeZone).toPlainDate().toString();
}

/** Whether a moment is more than the given time before now. */
export function isOlderThan(
  then: string,
  now: string,
  milliseconds: number,
): boolean {
  return elapsedMs(then, now) > milliseconds;
}
