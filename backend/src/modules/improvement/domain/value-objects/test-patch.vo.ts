import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** A SHA-256 digest in lower-case hex, which is how a patch is named. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

interface TestPatchProps {
  readonly text: string;
  readonly hash: string;
}

/**
 * The full text of the diff an attempt produced, and its hash. The hash
 * is made outside the domain and given with the text: an approval and a
 * verification report name the patch by it.
 */
export class TestPatch extends ValueObject<TestPatchProps> {
  private constructor(props: TestPatchProps) {
    super(props);
  }

  public static create(props: TestPatchProps): TestPatch {
    if (props.text === '' || !SHA256_HEX.test(props.hash)) {
      throw new InvalidImprovementValueError(
        `A patch has a text and a SHA-256 hash in lower-case hex, and ` +
          `"${props.hash}" names a patch of ${String(props.text.length)} ` +
          'characters.',
      );
    }
    return new TestPatch(props);
  }

  public get text(): string {
    return this.props.text;
  }

  public get hash(): string {
    return this.props.hash;
  }
}
