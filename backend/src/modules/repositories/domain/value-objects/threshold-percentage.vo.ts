import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidThresholdPercentageError } from '#repositories/domain/errors/invalid-threshold-percentage.error';

/** 0 would make no file a target, so the least is 1. */
const LEAST = 1;
const MOST = 100;

interface ThresholdPercentageProps {
  readonly value: number;
}

/**
 * The percent a person gave one repository as its threshold, a whole
 * number, so it reads as they typed it.
 */
export class ThresholdPercentage extends ValueObject<ThresholdPercentageProps> {
  private constructor(value: number) {
    super({ value });
  }

  public static create(value: number): ThresholdPercentage {
    if (!Number.isInteger(value) || value < LEAST || value > MOST) {
      throw new InvalidThresholdPercentageError(
        `${String(value)} is not a threshold: it is a whole percent from ` +
          `${String(LEAST)} to ${String(MOST)}.`,
      );
    }
    return new ThresholdPercentage(value);
  }

  public get value(): number {
    return this.props.value;
  }
}
