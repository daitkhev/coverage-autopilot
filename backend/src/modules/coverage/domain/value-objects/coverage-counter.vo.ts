import { InvalidCoverageCounterError } from '#coverage/domain/errors/invalid-coverage-counter.error';
import { CoveragePercentage } from '#coverage/domain/value-objects/coverage-percentage.vo';
import { ValueObject } from '#kernel/primitives/value-object';

interface CoverageCounterProps {
  readonly covered: number;
  readonly total: number;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** How many things of one kind, such as lines, ran out of how many. */
export class CoverageCounter extends ValueObject<CoverageCounterProps> {
  private constructor(props: CoverageCounterProps) {
    super(props);
  }

  public static create(props: CoverageCounterProps): CoverageCounter {
    const { covered, total } = props;
    if (!isCount(covered) || !isCount(total) || covered > total) {
      throw new InvalidCoverageCounterError(
        `${String(covered)} of ${String(total)} is not a count of covered ` +
          'things: both are whole numbers from 0, and the first is not more.',
      );
    }
    return new CoverageCounter({ covered, total });
  }

  public get covered(): number {
    return this.props.covered;
  }

  public get total(): number {
    return this.props.total;
  }

  /** Nothing of this kind to count. */
  public isEmpty(): boolean {
    return this.total === 0;
  }

  /** No percentage when there is nothing to count: that is not 0%. */
  public percentage(): CoveragePercentage | null {
    return this.isEmpty()
      ? null
      : CoveragePercentage.ofCounts(this.covered, this.total);
  }

  /**
   * Nothing to count is never below a percentage: no share of nothing is
   * less than another.
   */
  public isBelow(percentage: CoveragePercentage): boolean {
    return percentage.isGreaterThanShare(this.covered, this.total);
  }

  public plus(other: CoverageCounter): CoverageCounter {
    return new CoverageCounter({
      covered: this.covered + other.covered,
      total: this.total + other.total,
    });
  }
}
