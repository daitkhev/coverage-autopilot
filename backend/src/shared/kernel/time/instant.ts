import { InvalidInstantError } from '#kernel/errors/invalid-instant.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** The last millisecond of the year 9999, where a year still has 4 digits. */
const LAST = 253_402_300_799_999;

const MILLISECOND_DIGITS = 3;

/** The one text of a moment: UTC, with milliseconds, of a fixed width. */
const TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function holds(epochMilliseconds: number): boolean {
  return (
    Number.isInteger(epochMilliseconds) &&
    epochMilliseconds >= 0 &&
    epochMilliseconds <= LAST
  );
}

/** The one text of the moment, as the database and the contract keep it. */
function textOf(epochMilliseconds: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toString({
    fractionalSecondDigits: MILLISECOND_DIGITS,
  });
}

/**
 * The milliseconds since 1970 that a text of the one shape names. The
 * calendar of the platform refuses a day or an hour that does not exist,
 * and a text it refuses names no moment.
 */
function millisecondsOf(text: string): number {
  if (!TEXT.test(text)) {
    return Number.NaN;
  }
  try {
    return Temporal.Instant.from(text).epochMilliseconds;
  } catch {
    return Number.NaN;
  }
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
   * way. The platform reads more than the one shape, such as a second 60
   * it moves back to 59, and none of that is a moment here.
   */
  public static parse(text: string): Instant {
    const named = millisecondsOf(text);
    if (!holds(named) || textOf(named) !== text) {
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
    return textOf(this.epochMilliseconds);
  }
}
