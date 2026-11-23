import { describe, expect, it } from 'vitest';

import { InvalidInstantError } from '#kernel/errors/invalid-instant.error';
import { Instant } from '#kernel/time/instant';

/** Moments as text and as the milliseconds since 1970. */
const KNOWN: readonly (readonly [string, number])[] = [
  ['1970-01-01T00:00:00.000Z', 0],
  ['1999-12-31T23:59:59.999Z', 946_684_799_999],
  ['2000-02-29T12:00:00.000Z', 951_825_600_000],
  ['2001-01-01T00:00:00.000Z', 978_307_200_000],
  ['2024-02-29T23:59:59.999Z', 1_709_251_199_999],
  ['2026-11-21T10:00:00.123Z', 1_795_255_200_123],
  ['2100-03-01T00:00:00.000Z', 4_107_542_400_000],
  ['9999-12-31T23:59:59.999Z', 253_402_300_799_999],
];

const SECOND = 1000;

describe('Instant', () => {
  describe('fromEpochMilliseconds', () => {
    it.each(KNOWN)('should be written as %s', (text, milliseconds) => {
      expect(Instant.fromEpochMilliseconds(milliseconds).toString()).toBe(text);
    });

    describe('when the number is not a moment the service keeps', () => {
      it.each([
        ['a time before 1970', -1],
        ['a time after 9999', 253_402_300_800_000],
        ['a part of a millisecond', 0.5],
        ['not a number', Number.NaN],
        ['infinity', Number.POSITIVE_INFINITY],
      ])('should throw InvalidInstantError for %s', (_, milliseconds) => {
        expect(() => Instant.fromEpochMilliseconds(milliseconds)).toThrow(
          InvalidInstantError,
        );
      });
    });
  });

  describe('parse', () => {
    it.each(KNOWN)('should read %s', (text, milliseconds) => {
      expect(Instant.parse(text).epochMilliseconds).toBe(milliseconds);
    });

    describe('when the text is not the one format', () => {
      it.each([
        ['has no milliseconds', '2026-11-21T10:00:00Z'],
        ['has microseconds', '2026-11-21T10:00:00.123456Z'],
        ['has an offset', '2026-11-21T11:00:00.123+01:00'],
        ['has no zone', '2026-11-21T10:00:00.123'],
        ['has a space for the T', '2026-11-21 10:00:00.123Z'],
        ['is a date alone', '2026-11-21'],
        ['is empty', ''],
      ])('should throw InvalidInstantError when it %s', (_, text) => {
        expect(() => Instant.parse(text)).toThrow(InvalidInstantError);
      });
    });

    describe('when the text names a moment that does not exist', () => {
      it.each([
        ['the 30th of February', '2024-02-30T10:00:00.000Z'],
        ['the 29th of February of a plain year', '2026-02-29T10:00:00.000Z'],
        ['the 29th of February 2100', '2100-02-29T10:00:00.000Z'],
        ['the 31st of April', '2026-04-31T10:00:00.000Z'],
        ['the day 0', '2026-04-00T10:00:00.000Z'],
        ['the month 0', '2026-00-10T10:00:00.000Z'],
        ['the month 13', '2026-13-10T10:00:00.000Z'],
        ['the hour 24', '2026-11-21T24:00:00.000Z'],
        ['the minute 60', '2026-11-21T10:60:00.000Z'],
        ['the second 60', '2026-11-21T10:00:60.000Z'],
        ['a year before 1970', '1969-12-31T23:59:59.999Z'],
      ])('should throw InvalidInstantError for %s', (_, text) => {
        expect(() => Instant.parse(text)).toThrow(InvalidInstantError);
      });
    });
  });

  describe('equals', () => {
    it('should be equal to the same moment read from its text', () => {
      const [text, milliseconds] = KNOWN[5] ?? ['', 0];

      expect(
        Instant.parse(text).equals(Instant.fromEpochMilliseconds(milliseconds)),
      ).toBe(true);
    });
  });

  describe('plusMilliseconds', () => {
    it('should cross a year, and come back', () => {
      const last = Instant.parse('1999-12-31T23:59:59.999Z');

      const next = last.plusMilliseconds(1);

      expect(next.toString()).toBe('2000-01-01T00:00:00.000Z');
      expect(next.plusMilliseconds(-1).equals(last)).toBe(true);
    });

    it('should throw InvalidInstantError past the last moment', () => {
      const last = Instant.parse('9999-12-31T23:59:59.999Z');

      expect(() => last.plusMilliseconds(1)).toThrow(InvalidInstantError);
    });
  });

  describe('isBefore', () => {
    it('should order two moments, and not a moment and itself', () => {
      const early = Instant.parse('2026-11-21T10:00:00.000Z');
      const late = early.plusMilliseconds(SECOND);

      expect(early.isBefore(late)).toBe(true);
      expect(late.isBefore(early)).toBe(false);
      expect(early.isBefore(early)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should sort as text the way the moments sort in time', () => {
      const texts = KNOWN.map(([text]) => text);

      expect([...texts].reverse().sort()).toEqual(texts);
    });
  });

  describe('InvalidInstantError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidInstantError('x')).toMatchObject({
        name: 'InvalidInstantError',
        code: 'invalid_instant',
        retryable: false,
      });
    });
  });
});
