import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { BudgetUsage } from '#improvement/domain/value-objects/budget-usage.vo';
import { ValueObject } from '#kernel/primitives/value-object';
import type { Instant } from '#kernel/time/instant';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;

/** The three limits, by the names of the contract. */
export type BudgetLimit = 'attempts' | 'tokens' | 'minutes';

export interface BudgetLimits {
  readonly attempts: number;
  /** No limit under a subscription, whose own windows hold the generator. */
  readonly tokens: number | null;
  readonly minutes: number;
}

function isLimit(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value > 0);
}

/**
 * The limits of an improvement: attempts, tokens and minutes of work. The
 * minutes become an absolute deadline when work starts, so a restart of
 * the service cannot reset them, and a wait moves the deadline later.
 */
export class Budget extends ValueObject<BudgetLimits> {
  private constructor(limits: BudgetLimits) {
    super(limits);
  }

  public static create(limits: BudgetLimits): Budget {
    const { attempts, tokens, minutes } = limits;
    if (![attempts, tokens, minutes].every(isLimit)) {
      throw new InvalidImprovementValueError(
        `${String(attempts)} attempts, ${String(tokens)} tokens and ` +
          `${String(minutes)} minutes are not a budget: each is a whole ` +
          'number from 1, and only tokens may have no limit.',
      );
    }
    return new Budget(limits);
  }

  /**
   * A wait spends no minute of the budget, so the deadline moves later by
   * the length of the wait. A clock that went back moves it nowhere.
   */
  public static postpone(
    deadline: Instant,
    pausedSince: Instant,
    until: Instant,
  ): Instant {
    const pause = until.epochMilliseconds - pausedSince.epochMilliseconds;
    return deadline.plusMilliseconds(Math.max(0, pause));
  }

  public get limits(): BudgetLimits {
    return this.props;
  }

  public get attempts(): number {
    return this.props.attempts;
  }

  public get tokens(): number | null {
    return this.props.tokens;
  }

  public get minutes(): number {
    return this.props.minutes;
  }

  public deadlineFrom(start: Instant): Instant {
    return start.plusMilliseconds(this.minutes * MS_PER_MINUTE);
  }

  /**
   * The whole seconds of work up to `end`, from the deadline: every wait
   * moved the deadline by its length, so what is left of the limit is the
   * time to the deadline. Before work starts there is no deadline.
   */
  public secondsUsed(deadline: Instant | null, end: Instant): number {
    if (deadline === null) {
      return 0;
    }
    const left = deadline.epochMilliseconds - end.epochMilliseconds;
    const used = this.minutes * MS_PER_MINUTE - left;
    return Math.max(0, Math.floor(used / MS_PER_SECOND));
  }

  /** The first limit the usage reached, or `null` while each has some left. */
  public spentLimit(usage: BudgetUsage): BudgetLimit | null {
    if (usage.attempts >= this.attempts) {
      return 'attempts';
    }
    if (this.tokens !== null && usage.tokens >= this.tokens) {
      return 'tokens';
    }
    return usage.seconds >= this.minutes * SECONDS_PER_MINUTE
      ? 'minutes'
      : null;
  }
}
