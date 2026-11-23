import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** As long as the contract lets a sentence for people be. */
const SENTENCE_MAX_LENGTH = 8192;

export const FAILURE_REASONS = [
  'budget_exhausted',
  'stale_snapshot',
  'verification_error',
  'retries_exhausted',
  'existing_tests_fail',
  'mutation_unsupported',
  'quota_exhausted',
  'credential_exposed',
  'generator_unavailable',
  'publish_failed',
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

/** A sentence for people: not blank, and short enough to be sent. */
export function isSentence(text: string): boolean {
  return text.trim() !== '' && text.length <= SENTENCE_MAX_LENGTH;
}

interface ImprovementFailureProps {
  readonly reason: FailureReason;
  readonly message: string;
}

/** Why an improvement failed: a stable code for scripts and a sentence. */
export class ImprovementFailure extends ValueObject<ImprovementFailureProps> {
  private constructor(props: ImprovementFailureProps) {
    super(props);
  }

  public static create(props: ImprovementFailureProps): ImprovementFailure {
    if (!FAILURE_REASONS.includes(props.reason) || !isSentence(props.message)) {
      throw new InvalidImprovementValueError(
        `"${props.reason}" with "${props.message}" is not a failure: a ` +
          'known reason and a sentence.',
      );
    }
    return new ImprovementFailure(props);
  }

  public get reason(): FailureReason {
    return this.props.reason;
  }

  public get message(): string {
    return this.props.message;
  }
}
