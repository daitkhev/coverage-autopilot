import { describe, expect, it } from 'vitest';

import { HarnessError } from '#harness/shared/harness.error';
import {
  isRecord,
  isStringList,
  numberAt,
  recordAt,
  recordListAt,
  stringAt,
  stringListAt,
  stringListsAt,
  stringsAt,
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

describe('stringAt', () => {
  it('should give the text under a key', () => {
    expect(stringAt({ a: 'text' }, 'a')).toBe('text');
  });

  it('should throw HarnessError when the key holds no text', () => {
    expect(() => stringAt({ a: 1 }, 'a')).toThrow(HarnessError);
    expect(() => stringAt({}, 'a')).toThrow('"a" must be a string.');
  });
});

describe('stringListsAt', () => {
  it('should give a map of lists, in the order of the file', () => {
    const map = stringListsAt({ a: { second: ['x'], first: [] } }, 'a');

    expect([...map.entries()]).toEqual([
      ['second', ['x']],
      ['first', []],
    ]);
  });

  it('should throw HarnessError when a value is not a list of strings', () => {
    expect(() => stringListsAt({ a: { b: 'x' } }, 'a')).toThrow(HarnessError);
    expect(() => stringListsAt({ a: [] }, 'a')).toThrow(HarnessError);
  });
});

describe('stringsAt', () => {
  it('should give a map of strings, in the order of the file', () => {
    const map = stringsAt({ a: { second: 'x', first: 'y' } }, 'a');

    expect([...map.entries()]).toEqual([
      ['second', 'x'],
      ['first', 'y'],
    ]);
  });

  it('should throw HarnessError that names the value that is not text', () => {
    expect(() => stringsAt({ a: { b: 1 } }, 'a')).toThrow(
      '"a.b" must be a string.',
    );
  });
});

describe('recordListAt', () => {
  it('should give the list of objects under a key', () => {
    expect(recordListAt({ a: [{ b: 1 }, {}] }, 'a')).toEqual([{ b: 1 }, {}]);
  });

  it('should throw HarnessError when an item is not an object', () => {
    expect(() => recordListAt({ a: [{}, 1] }, 'a')).toThrow(HarnessError);
    expect(() => recordListAt({ a: {} }, 'a')).toThrow(
      '"a" must be a list of objects.',
    );
  });
});
