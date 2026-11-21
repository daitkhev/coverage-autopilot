import { InvalidInstantError } from '#kernel/errors/invalid-instant.error';
import { ValueObject } from '#kernel/primitives/value-object';
import { civilFromDays, daysFromCivil } from '#kernel/time/calendar';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** The last millisecond of the year 9999, where a year still has 4 digits. */
const LAST = 253_402_300_799_999;

const YEAR_DIGITS = 4;
const CLOCK_DIGITS = 2;
const MILLISECOND_DIGITS = 3;

/** The one text of a moment: UTC, with milliseconds, of a fixed width. */
const TEXT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})\.(?<millisecond>\d{3})Z$/u;

function digits(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function holds(epochMilliseconds: number): boolean {
  return (
    Number.isInteger(epochMilliseconds) &&
    epochMilliseconds >= 0 &&
    epochMilliseconds <= LAST
  );
}

/** The milliseconds since 1970 that the parts of a text name. */
function millisecondsOf(parts: Readonly<Record<string, string>>): number {
  const part = (name: string): number => Number(parts[name]);
  const days = daysFromCivil({
    year: part('year'),
    month: part('month'),
    day: part('day'),
  });
  return (
    days * MS_PER_DAY +
    part('hour') * MS_PER_HOUR +
    part('minute') * MS_PER_MINUTE +
    part('second') * MS_PER_SECOND +
    part('millisecond')
  );
}

interface InstantProps {
  readonly epochMilliseconds: number;
}

/**
 * A moment in time: the whole milliseconds since the start of 1970 in UTC.
 * It has no time zone. Its text is `YYYY-MM-DDTHH:mm:ss.sssZ`, the one
 * format of the database and of the contract, which sorts the way time
 * does. The years 1970 to 9999 are kept and nothing outside them.
 */
export class Instant extends ValueObject<InstantProps> {
  private constructor(epochMilliseconds: number) {
    super({ epochMilliseconds });
  }

  public static fromEpochMilliseconds(epochMilliseconds: number): Instant {
    if (!holds(epochMilliseconds)) {
      throw new InvalidInstantError(
        `${String(epochMilliseconds)} is not a whole number of milliseconds from 1970 to 9999.`,
      );
    }
    return new Instant(epochMilliseconds);
  }

  /**
   * A text is a moment only when the moment it names is written the same
   * way, which refuses the 30th of February and the hour 24.
   */
  public static parse(text: string): Instant {
    const parts = TEXT.exec(text)?.groups;
    const named = parts === undefined ? Number.NaN : millisecondsOf(parts);
    if (!holds(named) || new Instant(named).toString() !== text) {
      throw new InvalidInstantError(
        `"${text}" is not a moment in UTC as YYYY-MM-DDTHH:mm:ss.sssZ.`,
      );
    }
    return new Instant(named);
  }

  public get epochMilliseconds(): number {
    return this.props.epochMilliseconds;
  }

  public plusMilliseconds(milliseconds: number): Instant {
    return Instant.fromEpochMilliseconds(this.epochMilliseconds + milliseconds);
  }

  public isBefore(other: Instant): boolean {
    return this.epochMilliseconds < other.epochMilliseconds;
  }

  public override toString(): string {
    const days = Math.floor(this.epochMilliseconds / MS_PER_DAY);
    const inDay = this.epochMilliseconds - days * MS_PER_DAY;
    const { year, month, day } = civilFromDays(days);
    const date = [
      digits(year, YEAR_DIGITS),
      digits(month, CLOCK_DIGITS),
      digits(day, CLOCK_DIGITS),
    ].join('-');
    const time = [
      Math.floor(inDay / MS_PER_HOUR),
      Math.floor((inDay % MS_PER_HOUR) / MS_PER_MINUTE),
      Math.floor((inDay % MS_PER_MINUTE) / MS_PER_SECOND),
    ]
      .map((value) => digits(value, CLOCK_DIGITS))
      .join(':');
    return `${date}T${time}.${digits(inDay % MS_PER_SECOND, MILLISECOND_DIGITS)}Z`;
  }
}
