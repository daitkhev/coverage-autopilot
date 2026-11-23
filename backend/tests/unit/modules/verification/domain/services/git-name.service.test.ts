import { describe, expect, it } from 'vitest';

import {
  headerNamesOf,
  targetNameOf,
} from '#verification/domain/services/git-name.service';

describe('headerNamesOf', () => {
  it('should read the two names of a plain header', () => {
    expect(headerNamesOf('a/src/x.test.ts b/src/x.test.ts')).toEqual({
      old: 'src/x.test.ts',
      new: 'src/x.test.ts',
    });
  });

  it('should read a name with spaces, as git reads a new file', () => {
    expect(headerNamesOf('a/x b/y.ts b/x b/y.ts')).toEqual({
      old: 'x b/y.ts',
      new: 'x b/y.ts',
    });
  });

  it('should read two different names apart', () => {
    expect(headerNamesOf('a/old.test.ts b/new.test.ts')).toEqual({
      old: 'old.test.ts',
      new: 'new.test.ts',
    });
  });

  describe('when git quoted the names', () => {
    it('should read octal bytes as UTF-8', () => {
      expect(
        headerNamesOf(
          String.raw`"a/\303\274n\303\257.test.ts" "b/\303\274n\303\257.test.ts"`,
        ),
      ).toEqual({ old: 'ünï.test.ts', new: 'ünï.test.ts' });
    });

    it('should read the C escapes', () => {
      expect(headerNamesOf(String.raw`"a/q\"\\\t.ts" "b/q\"\\\t.ts"`)).toEqual({
        old: 'q"\\\t.ts',
        new: 'q"\\\t.ts',
      });
    });
  });

  describe('when git would not write the header so', () => {
    it('should give null', () => {
      for (const names of [
        'x.ts y.ts',
        'a/x.ts',
        String.raw`"a/x.ts" b/x.ts`,
        String.raw`"a/\q.ts" "b/\q.ts"`,
        String.raw`"a/\377.ts" "b/\377.ts"`,
        '"x.ts" "y.ts"',
      ]) {
        expect(headerNamesOf(names)).toBeNull();
      }
    });
  });
});

describe('targetNameOf', () => {
  it('should read the name after the prefix', () => {
    expect(targetNameOf('+++ b/src/x.test.ts')).toBe('src/x.test.ts');
  });

  it('should leave out the tab git ends a name with a space with', () => {
    expect(targetNameOf('+++ b/with space.test.ts\t')).toBe(
      'with space.test.ts',
    );
  });

  it('should read a quoted name', () => {
    expect(targetNameOf(String.raw`+++ "b/\303\274.test.ts"`)).toBe(
      'ü.test.ts',
    );
  });

  describe('when the line names no file of the new side', () => {
    it('should give null', () => {
      expect(targetNameOf('+++ /dev/null')).toBeNull();
      expect(targetNameOf('--- a/x.ts')).toBeNull();
      expect(targetNameOf('+++ "b/x.ts')).toBeNull();
    });
  });
});
