import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IMAGE_FILES, MIGRATIONS_FOLDER, PACKAGE_FILE } from '#service/main';
import { SHIPPED_IMAGE_FILES } from '#tests/support/shipped-image';
import { MIGRATIONS_FOLDER as MIGRATIONS_OF_THE_TESTS } from '#tests/support/temporary-database';

describe('main', () => {
  it('should find the migrations in the folder of the database code', () => {
    expect(resolve(MIGRATIONS_FOLDER)).toBe(resolve(MIGRATIONS_OF_THE_TESTS));
  });

  it('should find the package of the service one step up', () => {
    expect(readFileSync(PACKAGE_FILE, 'utf8')).toContain(
      '"name": "@coverage-autopilot/backend"',
    );
  });

  it.each(['sandbox', 'generator'] as const)(
    'should find the file of the image of the %s below its own folder',
    (image) => {
      const file = IMAGE_FILES[image];

      expect(resolve(file)).toBe(resolve(SHIPPED_IMAGE_FILES[image]));
      expect(readFileSync(file, 'utf8')).toMatch(/^FROM /mu);
    },
  );
});
