import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** One spelling of an id in every table, so lower case only. */
export const LOWER_CASE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ImprovementIdProps {
  readonly value: string;
}

/** The id of an improvement: a text UUID from the id generator. */
export class ImprovementId extends ValueObject<ImprovementIdProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): ImprovementId {
    if (!LOWER_CASE_UUID.test(value)) {
      throw new InvalidImprovementValueError(
        `"${value}" is not the id of an improvement: a UUID in lower case.`,
      );
    }
    return new ImprovementId(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
