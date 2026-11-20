import { describe, expect, it } from '@jest/globals';

import { isInPlace, isInSomePlace } from '#harness/architecture/patterns';

describe('isInPlace', () => {
  it('should read a place with a slash at the end as a folder', () => {
    expect(isInPlace('harness/bin/check.ts', 'harness/')).toBe(true);
    expect(isInPlace('harness/a/b/c.ts', 'harness/')).toBe(true);
    expect(isInPlace('harness-tools/check.ts', 'harness/')).toBe(false);
    expect(isInPlace('tools/harness/check.ts', 'harness/')).toBe(false);
  });

  it('should read any other place as one file', () => {
    expect(isInPlace('frontend/src/main.tsx', 'frontend/src/main.tsx')).toBe(
      true,
    );
    expect(isInPlace('frontend/src/main.tsx.ts', 'frontend/src/main.tsx')).toBe(
      false,
    );
  });

  it('should take a dot in a place as a dot', () => {
    expect(isInPlace('frontend/src/mainXtsx', 'frontend/src/main.tsx')).toBe(
      false,
    );
  });

  describe('the star', () => {
    it('should stand for one name', () => {
      const place = 'backend/src/modules/*/domain/';

      expect(isInPlace('backend/src/modules/store/domain/a.ts', place)).toBe(
        true,
      );
      expect(isInPlace('backend/src/modules/a/b/domain/a.ts', place)).toBe(
        false,
      );
    });

    it('should stand for a part of a name', () => {
      const place = 'backend/src/modules/*/*.module.ts';

      expect(
        isInPlace('backend/src/modules/store/store.module.ts', place),
      ).toBe(true);
      expect(isInPlace('backend/src/modules/store/store.ts', place)).toBe(
        false,
      );
      expect(
        isInPlace('backend/src/modules/store/domain/x.module.ts', place),
      ).toBe(false);
    });

    it('should keep a root file apart from a file in a folder', () => {
      expect(isInPlace('backend/src/main.ts', 'backend/src/*.ts')).toBe(true);
      expect(isInPlace('backend/src/shared/a.ts', 'backend/src/*.ts')).toBe(
        false,
      );
    });
  });
});

describe('isInSomePlace', () => {
  it('should be true when one place holds the path', () => {
    expect(isInSomePlace('b/x.ts', ['a/', 'b/'])).toBe(true);
    expect(isInSomePlace('c/x.ts', ['a/', 'b/'])).toBe(false);
    expect(isInSomePlace('c/x.ts', [])).toBe(false);
  });
});
