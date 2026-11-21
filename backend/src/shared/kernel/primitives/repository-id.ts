import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** Lower case only, so one id has one spelling in every table. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface RepositoryIdProps {
  readonly value: string;
}

/** The id of a connected repository: a text UUID from the id generator. */
export class RepositoryId extends ValueObject<RepositoryIdProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): RepositoryId {
    if (!UUID.test(value)) {
      throw new InvalidRepositoryIdError(
        `"${value}" is not a repository id: a UUID in lower case.`,
      );
    }
    return new RepositoryId(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
