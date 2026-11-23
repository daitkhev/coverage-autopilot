import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidBranchNameError } from '#repositories/domain/errors/invalid-branch-name.error';

/** Longer names do not fit in the name of a file, where git keeps a ref. */
const MAX_LENGTH = 255;

/**
 * What `git check-ref-format --branch` refuses. A name that starts with
 * "-" would also read as an option on a command line.
 */
const REFUSED: readonly (readonly [RegExp, string])[] = [
  [/[^!-~\u0080-\u{10FFFF}]/u, 'has a space or a control character'],
  [/[~^:?*[\\]/u, 'has one of ~ ^ : ? * [ \\'],
  [/^[-/]|\/$|\.$/u, 'starts with "-" or "/", or ends with "/" or "."'],
  [/\.\.|\/\/|@\{|^@$/u, 'has "..", "//" or "@{", or is "@"'],
  [
    /(?:^|\/)\.|\.lock(?:\/|$)/u,
    'has a part that starts with "." or ends with ".lock"',
  ],
];

function problemOf(value: string): string {
  if (value.length === 0 || value.length > MAX_LENGTH) {
    return `is empty or longer than ${String(MAX_LENGTH)} characters`;
  }
  const refused = REFUSED.find(([pattern]) => pattern.test(value));
  return refused === undefined ? '' : refused[1];
}

interface BranchNameProps {
  readonly value: string;
}

/** The short name of a branch, such as `main`, as git takes it. */
export class BranchName extends ValueObject<BranchNameProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): BranchName {
    const problem = problemOf(value);
    if (problem !== '') {
      throw new InvalidBranchNameError(
        `"${value}" is not the name of a branch: it ${problem}.`,
      );
    }
    return new BranchName(value);
  }

  public get value(): string {
    return this.props.value;
  }

  /** The full name of the ref, which no tag or option can be taken for. */
  public get ref(): string {
    return `refs/heads/${this.value}`;
  }
}
