import { InvalidFilePathError } from '#kernel/errors/invalid-file-path.error';
import { ValueObject } from '#kernel/primitives/value-object';

const SEPARATOR = '/';

/** Parts that would let two texts name one file, or a file outside. */
const NOT_A_NAME = new Set(['', '.', '..']);

/** A backslash is a separator on Windows, so it would be a second spelling. */
const FORBIDDEN = /[\\\0]/;

function problemOf(value: string): string {
  if (FORBIDDEN.test(value)) {
    return 'has a backslash or a NUL';
  }
  if (value.startsWith(SEPARATOR)) {
    return 'is absolute';
  }
  const parts = value.split(SEPARATOR);
  return parts.some((part) => NOT_A_NAME.has(part))
    ? 'has an empty, a "." or a ".." part'
    : '';
}

interface FilePathProps {
  readonly value: string;
}

/**
 * The path of a file in a repository as git stores it: relative, with
 * forward slashes and no "." or ".." parts. Letter case and Unicode form
 * are kept as they are, because git keeps them.
 */
export class FilePath extends ValueObject<FilePathProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): FilePath {
    const problem = problemOf(value);
    if (problem !== '') {
      throw new InvalidFilePathError(
        `"${value}" is not a path as git stores it: it ${problem}.`,
      );
    }
    return new FilePath(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
