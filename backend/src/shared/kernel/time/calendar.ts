/**
 * The Gregorian calendar in UTC as whole numbers, so that no part of the
 * service needs the `Date` of the language. These are the "days from
 * civil" algorithms of Howard Hinnant: a year is counted from March, which
 * puts the leap day last, and 400 years are one era of a fixed length.
 */

/** A day of the calendar: the month and the day start at 1. */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MONTHS = 12;
const MARCH = 3;
const YEARS_PER_ERA = 400;
const DAYS_PER_ERA = 146_097;
const DAYS_PER_CENTURY = 36_524;
const DAYS_PER_FOUR_YEARS = 1460;
const DAYS_PER_YEAR = 365;
const LEAP_EVERY = 4;
const NO_LEAP_EVERY = 100;

/** From March, every five months have 153 days: 31, 30, 31, 30, 31. */
const DAYS_PER_FIVE_MONTHS = 153;
const FIVE_MONTHS = 5;
const ROUNDING = 2;

/** From the first of March of the year 0 to the first of January 1970. */
const DAYS_BEFORE_1970 = 719_468;

/** The days of a year counted from March that are before a month of it. */
function daysBeforeMonth(fromMarch: number): number {
  return Math.floor(
    (DAYS_PER_FIVE_MONTHS * fromMarch + ROUNDING) / FIVE_MONTHS,
  );
}

/** The days of an era that are before a year of it. */
function daysBeforeYear(yearOfEra: number): number {
  return (
    DAYS_PER_YEAR * yearOfEra +
    Math.floor(yearOfEra / LEAP_EVERY) -
    Math.floor(yearOfEra / NO_LEAP_EVERY)
  );
}

/** The whole days from the first of January 1970 to a day. */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const fromMarch = month >= MARCH ? month - MARCH : month + MONTHS - MARCH;
  const startedInMarch = month >= MARCH ? year : year - 1;
  const era = Math.floor(startedInMarch / YEARS_PER_ERA);
  const yearOfEra = startedInMarch - era * YEARS_PER_ERA;
  const dayOfEra = daysBeforeYear(yearOfEra) + daysBeforeMonth(fromMarch) + day;
  return era * DAYS_PER_ERA + dayOfEra - 1 - DAYS_BEFORE_1970;
}

/** The year of its era that a day of the era is in. */
function yearOfEraAt(dayOfEra: number): number {
  const leapDays =
    Math.floor(dayOfEra / DAYS_PER_FOUR_YEARS) -
    Math.floor(dayOfEra / DAYS_PER_CENTURY) +
    Math.floor(dayOfEra / (DAYS_PER_ERA - 1));
  return Math.floor((dayOfEra - leapDays) / DAYS_PER_YEAR);
}

/** The day that is so many whole days after the first of January 1970. */
export function civilFromDays(days: number): CivilDate {
  const sinceYearZero = days + DAYS_BEFORE_1970;
  const era = Math.floor(sinceYearZero / DAYS_PER_ERA);
  const dayOfEra = sinceYearZero - era * DAYS_PER_ERA;
  const yearOfEra = yearOfEraAt(dayOfEra);
  const dayOfYear = dayOfEra - daysBeforeYear(yearOfEra);
  const fromMarch = Math.floor(
    (FIVE_MONTHS * dayOfYear + ROUNDING) / DAYS_PER_FIVE_MONTHS,
  );
  const month =
    fromMarch + MARCH > MONTHS ? fromMarch + MARCH - MONTHS : fromMarch + MARCH;
  return {
    year: era * YEARS_PER_ERA + yearOfEra + (month < MARCH ? 1 : 0),
    month,
    day: dayOfYear - daysBeforeMonth(fromMarch) + 1,
  };
}
