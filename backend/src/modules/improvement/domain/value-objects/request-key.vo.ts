import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** Characters that need no escaping in a header, a log line or a query. */
const KEY = /^[A-Za-z0-9_-]{1,128}$/;

interface RequestKeyProps {
  readonly value: string;
}

/**
 * The key the client made for one command. The same key always gives the
 * same improvement, so it is compared as it was given.
 */
export class RequestKey extends ValueObject<RequestKeyProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): RequestKey {
    if (!KEY.test(value)) {
      throw new InvalidImprovementValueError(
        `"${value}" is not a request key: 1 to 128 letters, digits, ` +
          '"-" and "_".',
      );
    }
    return new RequestKey(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
