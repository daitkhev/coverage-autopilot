import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { ValueObject } from '#kernel/primitives/value-object';

const PREFIX = 'coverage-autopilot/';

interface BranchNameProps {
  readonly value: string;
}

/**
 * The branch an improvement publishes to. It follows from the id alone,
 * so a run of publishing that starts again finds the branch it made.
 */
export class BranchName extends ValueObject<BranchNameProps> {
  private constructor(value: string) {
    super({ value });
  }

  public static of(id: ImprovementId): BranchName {
    return new BranchName(`${PREFIX}${id.value}`);
  }

  /** A stored name, which must be the one its improvement would get. */
  public static parse(value: string, id: ImprovementId): BranchName {
    const name = BranchName.of(id);
    if (name.value !== value) {
      throw new InvalidImprovementValueError(
        `"${value}" is not the branch of the improvement ${id.value}.`,
      );
    }
    return name;
  }

  public get value(): string {
    return this.props.value;
  }
}
