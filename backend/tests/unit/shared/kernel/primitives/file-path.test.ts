import { describe, expect, it } from 'vitest';

import { InvalidFilePathError } from '#kernel/errors/invalid-file-path.error';
import { FilePath } from '#kernel/primitives/file-path';

describe('FilePath', () => {
  describe('create', () => {
    it.each(['src/a.ts', 'a.ts', 'src/.hidden/a.ts', 'src/a..b.ts'])(
      'should keep a path as git stores it: %s',
      (path) => {
        expect(FilePath.create(path).value).toBe(path);
      },
    );

    it('should keep letter case and Unicode form as they are', () => {
      const composed = 'src/Café.ts';
      const decomposed = 'src/Café.ts';

      expect(FilePath.create(composed).value).toBe(composed);
      expect(
        FilePath.create(composed).equals(FilePath.create(decomposed)),
      ).toBe(false);
    });

    describe('when the path is not as git stores it', () => {
      it.each([
        ['', 'has an empty, a "." or a ".." part'],
        ['/src/a.ts', 'is absolute'],
        ['src\\a.ts', 'has a backslash or a NUL'],
        ['src/a\0.ts', 'has a backslash or a NUL'],
        ['./src/a.ts', 'has an empty, a "." or a ".." part'],
        ['src/../a.ts', 'has an empty, a "." or a ".." part'],
        ['src//a.ts', 'has an empty, a "." or a ".." part'],
        ['src/', 'has an empty, a "." or a ".." part'],
      ])('should throw InvalidFilePathError for "%s"', (path, problem) => {
        expect(() => FilePath.create(path)).toThrow(
          new InvalidFilePathError(
            `"${path}" is not a path as git stores it: it ${problem}.`,
          ),
        );
      });
    });
  });

  describe('InvalidFilePathError', () => {
    it('should be a fault of the domain that is not retried', () => {
      const error = new InvalidFilePathError('x');

      expect(error).toMatchObject({
        name: 'InvalidFilePathError',
        code: 'invalid_file_path',
        retryable: false,
      });
    });
  });
});
