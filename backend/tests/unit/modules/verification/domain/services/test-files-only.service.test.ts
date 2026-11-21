import { describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { newFilePatch } from '#tests/support/verification-requests';
import {
  appliedFilesProblemOf,
  type TestFiles,
  testFilesOf,
} from '#verification/domain/services/test-files-only.service';

const SUFFIXES = ['.test.ts', '.test.tsx'];

function filesOf(...paths: string[]): TestFiles {
  return testFilesOf({
    text: paths.map((path) => newFilePatch(path)).join(''),
    suffixes: SUFFIXES,
  });
}

function reasonOf(...paths: string[]): string {
  const files = filesOf(...paths);
  return files.outcome === 'refused' ? files.reason : '';
}

const paths = (...values: string[]): FilePath[] =>
  values.map((value) => FilePath.create(value));

describe('testFilesOf', () => {
  it('should give the new test files of the patch as paths', () => {
    expect(filesOf('src/a.test.ts', 'ui/b.test.tsx')).toEqual({
      outcome: 'test_files',
      files: paths('src/a.test.ts', 'ui/b.test.tsx'),
    });
  });

  describe('when the text adds something else than new files', () => {
    it('should refuse it with the reason of the reading', () => {
      expect(
        testFilesOf({ text: 'diff --git a/x b/y\n', suffixes: SUFFIXES }),
      ).toEqual({
        outcome: 'refused',
        reason: 'The patch renames or copies x to y.',
      });
    });
  });

  describe('when a path is not a test file of the repository', () => {
    it('should refuse it with a sentence that names the file', () => {
      expect(reasonOf('src/a.test.ts', 'src/used.ts')).toBe(
        'The patch adds src/used.ts, whose name does not end like a test file: .test.ts or .test.tsx.',
      );
      expect(reasonOf('/etc/a.test.ts')).toBe(
        'The patch adds /etc/a.test.ts, an absolute path.',
      );
      expect(reasonOf('../a.test.ts')).toBe(
        'The patch adds ../a.test.ts, which leads out of the repository.',
      );
      expect(reasonOf('src/./a.test.ts')).toContain('not a plain path');
      expect(reasonOf('src//a.test.ts')).toContain('not a plain path');
      expect(reasonOf('src\\a.test.ts')).toContain('not a plain path');
    });
  });

  describe('when the patch adds a file twice', () => {
    it('should refuse it', () => {
      expect(reasonOf('src/a.test.ts', 'src/a.test.ts')).toBe(
        'The patch adds src/a.test.ts twice.',
      );
    });
  });
});

describe('appliedFilesProblemOf', () => {
  it('should find nothing when git wrote exactly the files of the text', () => {
    expect(
      appliedFilesProblemOf({
        applied: paths('b.test.ts', 'a.test.ts'),
        added: paths('a.test.ts', 'b.test.ts'),
      }),
    ).toBeNull();
  });

  describe('when git wrote a file the text does not add', () => {
    it('should name it', () => {
      expect(
        appliedFilesProblemOf({
          applied: paths('a.test.ts', 'src/used.ts'),
          added: paths('a.test.ts'),
        }),
      ).toBe(
        'git wrote src/used.ts, which the text of the patch does not add as a test file.',
      );
    });
  });

  describe('when git did not write a file the text adds', () => {
    it('should name it', () => {
      expect(
        appliedFilesProblemOf({ applied: [], added: paths('a.test.ts') }),
      ).toBe('git did not write a.test.ts, which the text of the patch adds.');
    });
  });
});
