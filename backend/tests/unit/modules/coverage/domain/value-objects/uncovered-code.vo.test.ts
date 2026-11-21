import { describe, expect, it } from 'vitest';

import { InvalidUncoveredCodeError } from '#coverage/domain/errors/invalid-uncovered-code.error';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';

const SOME = {
  lines: [{ start: 2, end: 4 }],
  branchLines: [3],
  functions: [{ name: 'halve', line: 5 }],
};

const MESSAGE =
  'Every line of uncovered code is a whole number from 1, and a range ' +
  'does not end before it starts.';

describe('UncoveredCode', () => {
  describe('create', () => {
    it('should keep the lines, the branch lines and the functions', () => {
      const code = UncoveredCode.create(SOME);

      expect(code.lines).toEqual(SOME.lines);
      expect(code.branchLines).toEqual(SOME.branchLines);
      expect(code.functions).toEqual(SOME.functions);
    });

    it('should keep its own copy of what it was given', () => {
      const lines = [{ start: 1, end: 1 }];
      const code = UncoveredCode.create({ ...SOME, lines });
      lines[0] = { start: 9, end: 9 };

      expect(code.lines).toEqual([{ start: 1, end: 1 }]);
    });

    describe('when a line is not a line of a file', () => {
      it.each([
        { ...SOME, lines: [{ start: 0, end: 1 }] },
        { ...SOME, lines: [{ start: 1, end: 1.5 }] },
        { ...SOME, lines: [{ start: 3, end: 2 }] },
        { ...SOME, branchLines: [0] },
        { ...SOME, functions: [{ name: 'f', line: -1 }] },
      ])('should throw InvalidUncoveredCodeError', (props) => {
        expect(() => UncoveredCode.create(props)).toThrow(
          new InvalidUncoveredCodeError(MESSAGE),
        );
      });
    });
  });

  describe('none', () => {
    it('should list nothing', () => {
      expect(UncoveredCode.none()).toMatchObject({
        lines: [],
        branchLines: [],
        functions: [],
      });
    });
  });

  describe('equals', () => {
    it('should compare the records by their content', () => {
      expect(
        UncoveredCode.create(SOME).equals(UncoveredCode.create(SOME)),
      ).toBe(true);
      expect(UncoveredCode.create(SOME).equals(UncoveredCode.none())).toBe(
        false,
      );
    });
  });

  describe('InvalidUncoveredCodeError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidUncoveredCodeError('x')).toMatchObject({
        code: 'invalid_uncovered_code',
        retryable: false,
      });
    });
  });
});
