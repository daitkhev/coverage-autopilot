import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { LOWER_CASE_UUID } from '#improvement/domain/value-objects/improvement-id.vo';
import { ValueObject } from '#kernel/primitives/value-object';

interface SnapshotIdProps {
  readonly value: string;
}

/**
 * The id of a coverage snapshot, as the coverage module gives it. An
 * improvement refers to its snapshots by id alone.
 */
export class SnapshotId extends ValueObject<SnapshotIdProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): SnapshotId {
    if (!LOWER_CASE_UUID.test(value)) {
      throw new InvalidImprovementValueError(
        `"${value}" is not the id of a snapshot: a UUID in lower case.`,
      );
    }
    return new SnapshotId(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
