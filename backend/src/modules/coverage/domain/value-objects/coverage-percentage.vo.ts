import { InvalidCoveragePercentageError } from '#coverage/domain/errors/invalid-coverage-percentage.error';
import { ValueObject } from '#kernel/primitives/value-object';

const WHOLE = 100;

interface CoveragePercentageProps {
  readonly value: number;
}

/**
 * A share of code that ran, from 0 to 100. It is kept as it was computed,
 * not rounded: rounding is a matter of how a number is shown.
 */
export class CoveragePercentage extends ValueObject<CoveragePercentageProps> {
  private constructor(value: number) {
    super({ value });
  }

  public static create(value: number): CoveragePercentage {
    if (!Number.isFinite(value) || value < 0 || value > WHOLE) {
      throw new InvalidCoveragePercentageError(
        `${String(value)} is not a percentage from 0 to 100.`,
      );
    }
    return new CoveragePercentage(value);
  }

  /** The share `covered` of `total` is, when there is something to count. */
  public static ofCounts(covered: number, total: number): CoveragePercentage {
    return CoveragePercentage.create((covered * WHOLE) / total);
  }

  public get value(): number {
    return this.props.value;
  }

  /**
   * Whether this is more than the share `covered` of `total`, compared
   * without a division so that no rounding decides it.
   */
  public isGreaterThanShare(covered: number, total: number): boolean {
    return covered * WHOLE < this.value * total;
  }
}
