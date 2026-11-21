import { InvalidSnapshotIdError } from '#coverage/domain/errors/invalid-snapshot-id.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** One spelling of an id in every table, so lower case only. */
const LOWER_CASE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface SnapshotIdProps {
  readonly value: string;
}

/**
 * The id of a coverage snapshot. Repository and commit do not identify a
 * snapshot, because the same commit measured with other tools gives other
 * numbers.
 */
export class SnapshotId extends ValueObject<SnapshotIdProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static create(value: string): SnapshotId {
    if (!LOWER_CASE_UUID.test(value)) {
      throw new InvalidSnapshotIdError(
        `"${value}" is not the id of a snapshot: a UUID in lower case.`,
      );
    }
    return new SnapshotId(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
