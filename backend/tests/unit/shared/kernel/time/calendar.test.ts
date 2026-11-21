import { describe, expect, it } from 'vitest';

import {
  type CivilDate,
  civilFromDays,
  daysFromCivil,
} from '#kernel/time/calendar';

/** Days of the calendar and the whole days from 1970 to each of them. */
const KNOWN: readonly (readonly [string, CivilDate, number])[] = [
  ['the first day of 1970', { year: 1970, month: 1, day: 1 }, 0],
  ['the first of March 1970', { year: 1970, month: 3, day: 1 }, 59],
  ['the leap day of 2000', { year: 2000, month: 2, day: 29 }, 11_016],
  ['the day after it', { year: 2000, month: 3, day: 1 }, 11_017],
  ['the leap day of 2024', { year: 2024, month: 2, day: 29 }, 19_782],
  ['the last of February 2100', { year: 2100, month: 2, day: 28 }, 47_540],
  ['the day after, with no leap day', { year: 2100, month: 3, day: 1 }, 47_541],
  ['the leap day of 2400', { year: 2400, month: 2, day: 29 }, 157_113],
  ['the last day of 9999', { year: 9999, month: 12, day: 31 }, 2_932_896],
];

/** Every day from 1970 to the end of 2400, which is a whole era and more. */
const DAYS_TO_2401 = 157_420;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The day after a day, counted the plain way a person does. */
function dayAfter({ year, month, day }: CivilDate): CivilDate {
  const leapDay = month === 2 && isLeap(year) ? 1 : 0;
  if (day < (DAYS_IN_MONTH[month - 1] ?? 0) + leapDay) {
    return { year, month, day: day + 1 };
  }
  return month === 12
    ? { year: year + 1, month: 1, day: 1 }
    : { year, month: month + 1, day: 1 };
}

describe('daysFromCivil', () => {
  it.each(KNOWN)('should count the days to %s', (_, date, days) => {
    expect(daysFromCivil(date)).toBe(days);
  });
});

describe('civilFromDays', () => {
  it.each(KNOWN)('should name %s', (_, date, days) => {
    expect(civilFromDays(days)).toEqual(date);
  });

  it('should name every day from 1970 to 2400 as the day after the last', () => {
    let expected: CivilDate = { year: 1970, month: 1, day: 1 };
    const wrong: number[] = [];

    for (let days = 0; days < DAYS_TO_2401; days += 1) {
      const named = civilFromDays(days);
      const same =
        named.year === expected.year &&
        named.month === expected.month &&
        named.day === expected.day;
      if (!same || daysFromCivil(named) !== days) {
        wrong.push(days);
      }
      expected = dayAfter(expected);
    }

    expect(wrong).toEqual([]);
    expect(expected).toEqual({ year: 2401, month: 1, day: 1 });
  });
});
