import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { SHA256_HEX } from '#improvement/domain/value-objects/test-patch.vo';
import { ValueObject } from '#kernel/primitives/value-object';

interface RequestFingerprintProps {
  readonly value: string;
}

/**
 * The hash of what an improvement was asked to do, made outside the
 * domain. Two requests with the same fingerprint ask for the same work.
 */
export class RequestFingerprint extends ValueObject<RequestFingerprintProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): RequestFingerprint {
    if (!SHA256_HEX.test(value)) {
      throw new InvalidImprovementValueError(
        `"${value}" is not a request fingerprint: a SHA-256 hash in ` +
          'lower-case hex.',
      );
    }
    return new RequestFingerprint(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
