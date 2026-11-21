import { BudgetAboveMaximumError } from '#improvement/domain/errors/budget-above-maximum.error';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import {
  Budget,
  type BudgetLimit,
  type BudgetLimits,
} from '#improvement/domain/value-objects/budget.vo';
import { ValueObject } from '#kernel/primitives/value-object';

/** What a request asks for. A limit it leaves out is the default. */
export type BudgetRequest = Partial<BudgetLimits>;

interface BudgetSettingsProps {
  readonly defaults: Budget;
  readonly maximums: Budget;
}

const LIMITS: readonly BudgetLimit[] = ['attempts', 'tokens', 'minutes'];

/** Whether `value` fits under `maximum`, where no limit fits under none. */
function fits(value: number | null, maximum: number | null): boolean {
  return value === null || maximum === null
    ? value === maximum
    : value <= maximum;
}

function shown(value: number | null): string {
  return value === null ? 'no limit' : String(value);
}

/** The first limit of `budget` that does not fit under `maximums`. */
function firstAbove(budget: Budget, maximums: Budget): BudgetLimit | undefined {
  return LIMITS.find((limit) => !fits(budget[limit], maximums[limit]));
}

/**
 * The budget the service fills a request with, and the most it accepts.
 * Tokens have a limit only with a key: under a subscription both the
 * default and the maximum have none.
 */
export class BudgetSettings extends ValueObject<BudgetSettingsProps> {
  private constructor(props: BudgetSettingsProps) {
    super(props);
  }

  public static create(props: BudgetSettingsProps): BudgetSettings {
    const above = firstAbove(props.defaults, props.maximums);
    if (above !== undefined) {
      throw new InvalidImprovementValueError(
        `The default ${above} is not within the maximum, or only one of ` +
          'them has a limit.',
      );
    }
    return new BudgetSettings(props);
  }

  public get defaults(): Budget {
    return this.props.defaults;
  }

  public get maximums(): Budget {
    return this.props.maximums;
  }

  /** The budget of a request: what it asks for, within the maximums. */
  public fill(request: BudgetRequest): Budget {
    const budget = Budget.create({ ...this.defaults.limits, ...request });
    const above = firstAbove(budget, this.maximums);
    if (above !== undefined) {
      throw new BudgetAboveMaximumError(
        `The budget asks for ${shown(budget[above])} of ${above}, and the ` +
          `service allows ${shown(this.maximums[above])}.`,
      );
    }
    return budget;
  }
}
