import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchCredential } from '#improvement/infrastructure/generator/credential-search';
import {
  CREDENTIAL_VALUE,
  GENERATOR_TEST_SETTINGS,
} from '#tests/support/generator-request';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

let folder: ProjectFolder;

beforeEach(() => {
  folder = createProjectFolder({
    'tests/clean.test.ts': 'it("adds", () => {});',
    'tests/leak.test.ts': `const t = "${CREDENTIAL_VALUE}";`,
  });
});

afterEach(() => {
  folder.remove();
});

describe('searchCredential', () => {
  it('should find the credential in the text of a written file', () => {
    expect(
      searchCredential(
        folder.root,
        ['tests/clean.test.ts', 'tests/leak.test.ts'],
        GENERATOR_TEST_SETTINGS,
      ),
    ).toEqual({ exposed: true, notes: [] });
  });

  it('should find nothing in clean files, and pass over one that is gone', () => {
    expect(
      searchCredential(
        folder.root,
        ['tests/clean.test.ts', 'tests/gone.test.ts'],
        GENERATOR_TEST_SETTINGS,
      ),
    ).toEqual({ exposed: false, notes: [] });
  });

  it('should search no more files than the settings allow, and say so', () => {
    expect(
      searchCredential(
        folder.root,
        ['tests/clean.test.ts', 'tests/leak.test.ts'],
        { ...GENERATOR_TEST_SETTINGS, scan: { maxFiles: 1, maxFileBytes: 64 } },
      ),
    ).toEqual({
      exposed: false,
      notes: ['1 more written files were not searched.'],
    });
  });
});
