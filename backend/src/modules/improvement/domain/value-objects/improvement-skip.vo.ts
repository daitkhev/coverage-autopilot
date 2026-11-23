import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { isSentence } from '#improvement/domain/value-objects/improvement-failure.vo';
import { ValueObject } from '#kernel/primitives/value-object';

/**
 * `threshold_met`: the fresh measurement is already above the threshold.
 * `no_undetected_mutants`: no test misses a mutant, so a new test could
 * not be shown to check anything.
 */
export const SKIP_REASONS = ['threshold_met', 'no_undetected_mutants'] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

interface ImprovementSkipProps {
  readonly reason: SkipReason;
  readonly message: string;
}

/** Why there was nothing to improve: a stable code and a sentence. */
export class ImprovementSkip extends ValueObject<ImprovementSkipProps> {
  private constructor(props: ImprovementSkipProps) {
    super(props);
  }

  public static create(props: ImprovementSkipProps): ImprovementSkip {
    if (!SKIP_REASONS.includes(props.reason) || !isSentence(props.message)) {
      throw new InvalidImprovementValueError(
        `"${props.reason}" with "${props.message}" is not a skip: a known ` +
          'reason and a sentence.',
      );
    }
    return new ImprovementSkip(props);
  }

  public get reason(): SkipReason {
    return this.props.reason;
  }

  public get message(): string {
    return this.props.message;
  }
}
