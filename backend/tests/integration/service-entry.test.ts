import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER } from '#service/main';
import { MIGRATIONS_FOLDER as MIGRATIONS_OF_THE_TESTS } from '#tests/support/temporary-database';

describe('main', () => {
  it('should find the migrations one step up from its own folder', () => {
    expect(resolve(MIGRATIONS_FOLDER)).toBe(resolve(MIGRATIONS_OF_THE_TESTS));
  });
});
