import { describe, expect, it } from 'vitest';

import {
  commitShaSchema,
  emptyBodySchema,
  filePathSchema,
  idSchema,
  patchHashSchema,
  percentageSchema,
  resourceParamsSchema,
  timestampSchema,
} from '#api-contracts/values';

const SHA1 = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

describe('idSchema', () => {
  it('should accept a short id', () => {
    expect(idSchema.safeParse('imp_01').success).toBe(true);
  });

  it.each([[''], ['x'.repeat(65)], [7]])('should refuse %j', (value) => {
    expect(idSchema.safeParse(value).success).toBe(false);
  });
});

describe('timestampSchema', () => {
  it('should accept a moment in UTC with milliseconds', () => {
    const moment = '2026-11-21T10:00:00.123Z';

    expect(timestampSchema.safeParse(moment).success).toBe(true);
  });

  it.each([
    ['2026-11-21T11:00:00.123+01:00'],
    ['2026-11-21T10:00:00.123+00:00'],
    ['2026-11-21T10:00:00.123'],
  ])('should refuse %s, which is not said in UTC', (value) => {
    expect(timestampSchema.safeParse(value).success).toBe(false);
  });

  it.each([['2026-11-21T10:00:00Z'], ['2026-11-21T10:00:00.123456Z']])(
    'should refuse %s, which has no milliseconds or more than them',
    (value) => {
      expect(timestampSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each([['2026-11-21'], ['yesterday'], [0]])('should refuse %j', (value) => {
    expect(timestampSchema.safeParse(value).success).toBe(false);
  });
});

describe('commitShaSchema', () => {
  it.each([[SHA1], [SHA256]])('should accept %s', (value) => {
    expect(commitShaSchema.safeParse(value).success).toBe(true);
  });

  it.each([['a'.repeat(39)], ['A'.repeat(40)], ['g'.repeat(40)]])(
    'should refuse %s',
    (value) => {
      expect(commitShaSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('filePathSchema', () => {
  it.each([['src/billing/invoice.ts'], ['a..b/c.ts'], ['.github/x.ts']])(
    'should accept %s',
    (value) => {
      expect(filePathSchema.safeParse(value).success).toBe(true);
    },
  );

  describe('when the path leaves the repository', () => {
    it.each([['/etc/hosts'], ['../x.ts'], ['src/../../x.ts'], ['src/..']])(
      'should refuse %s',
      (value) => {
        expect(filePathSchema.safeParse(value).success).toBe(false);
      },
    );
  });

  it('should refuse an empty path', () => {
    expect(filePathSchema.safeParse('').success).toBe(false);
  });
});

describe('patchHashSchema', () => {
  it('should accept a SHA-256 digest', () => {
    expect(patchHashSchema.safeParse(SHA256).success).toBe(true);
  });

  it('should refuse a SHA-1 digest', () => {
    expect(patchHashSchema.safeParse(SHA1).success).toBe(false);
  });
});

describe('percentageSchema', () => {
  it.each([[0], [41.2], [100]])('should accept %d', (value) => {
    expect(percentageSchema.safeParse(value).success).toBe(true);
  });

  it.each([[-0.1], [100.1], ['50']])('should refuse %j', (value) => {
    expect(percentageSchema.safeParse(value).success).toBe(false);
  });
});

describe('resourceParamsSchema', () => {
  it('should accept an id', () => {
    expect(resourceParamsSchema.safeParse({ id: 'r1' }).success).toBe(true);
  });

  it('should refuse an unknown key', () => {
    const value = { id: 'r1', extra: true };

    expect(resourceParamsSchema.safeParse(value).success).toBe(false);
  });
});

describe('emptyBodySchema', () => {
  it('should accept an empty object', () => {
    expect(emptyBodySchema.safeParse({}).success).toBe(true);
  });

  it('should refuse a stray field', () => {
    expect(emptyBodySchema.safeParse({ force: true }).success).toBe(false);
  });
});
