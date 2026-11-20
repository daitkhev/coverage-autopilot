import { describe, expect, it } from '@jest/globals';

import { HarnessError } from '#harness/shared/harness.error';
import {
  isRecord,
  isStringList,
  numberAt,
  recordAt,
  stringListAt,
} from '#harness/shared/json';

describe('isRecord', () => {
  it('should accept an object and refuse everything else', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('text')).toBe(false);
  });
});

describe('isStringList', () => {
  it('should accept only a list whose items are all strings', () => {
    expect(isStringList(['a', 'b'])).toBe(true);
    expect(isStringList([])).toBe(true);
    expect(isStringList(['a', 1])).toBe(false);
    expect(isStringList('a')).toBe(false);
  });
});

describe('recordAt', () => {
  it('should give the object under a key', () => {
    expect(recordAt({ a: { b: 1 } }, 'a')).toEqual({ b: 1 });
  });

  it('should throw HarnessError when the key holds no object', () => {
    expect(() => recordAt({ a: 1 }, 'a')).toThrow(HarnessError);
    expect(() => recordAt({}, 'a')).toThrow('"a" must be an object.');
  });
});

describe('stringListAt', () => {
  it('should give the list under a key', () => {
    expect(stringListAt({ a: ['x'] }, 'a')).toEqual(['x']);
  });

  it('should throw HarnessError when the key holds something else', () => {
    expect(() => stringListAt({ a: [1] }, 'a')).toThrow(HarnessError);
  });
});

describe('numberAt', () => {
  it('should give the number under a key', () => {
    expect(numberAt({ a: 50 }, 'a')).toBe(50);
  });

  it('should throw HarnessError for a missing or broken number', () => {
    expect(() => numberAt({}, 'a')).toThrow(HarnessError);
    expect(() => numberAt({ a: '50' }, 'a')).toThrow('"a" must be a number.');
    expect(() => numberAt({ a: Number.NaN }, 'a')).toThrow(HarnessError);
  });
});
