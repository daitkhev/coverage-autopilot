import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

interface BudgetUsageProps {
  /** Every attempt that was opened, the open one too. */
  readonly attempts: number;
  /** Input and output tokens of every call of the generator. */
  readonly tokens: number;
  /** Seconds of work, waits left out. */
  readonly seconds: number;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** What an improvement has spent of its budget so far. */
export class BudgetUsage extends ValueObject<BudgetUsageProps> {
  private constructor(props: BudgetUsageProps) {
    super(props);
  }

  public static create(props: BudgetUsageProps): BudgetUsage {
    const counts = [props.attempts, props.tokens, props.seconds];
    if (!counts.every(isCount)) {
      throw new InvalidImprovementValueError(
        `${counts.join(', ')} is not a usage of a budget: each is a whole ` +
          'number from 0.',
      );
    }
    return new BudgetUsage(props);
  }

  public get attempts(): number {
    return this.props.attempts;
  }

  public get tokens(): number {
    return this.props.tokens;
  }

  public get seconds(): number {
    return this.props.seconds;
  }
}
