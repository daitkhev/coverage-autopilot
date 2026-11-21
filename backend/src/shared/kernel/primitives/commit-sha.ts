import { InvalidCommitShaError } from '#kernel/errors/invalid-commit-sha.error';
import { ValueObject } from '#kernel/primitives/value-object';

/**
 * The full hash, never a short one: a short hash can name another commit
 * once the repository grows. SHA-1 has 40 digits and SHA-256 has 64.
 */
const FULL_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

interface CommitShaProps {
  readonly value: string;
}

/** The hash of one commit, in lower case as git prints it. */
export class CommitSha extends ValueObject<CommitShaProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): CommitSha {
    if (!FULL_HASH.test(value)) {
      throw new InvalidCommitShaError(
        `"${value}" is not the full hash of a commit in lower case.`,
      );
    }
    return new CommitSha(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
