import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** The seven checks of the quality gate, in the order they run. */
export const CHECK_NAMES = [
  'test_files_only',
  'type_check',
  'new_tests_pass',
  'existing_tests_pass',
  'repeated_runs',
  'coverage_increase',
  'mutation_gain',
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

const MAX_PERCENTAGE = 100;

/**
 * The check the gate applies a patch after. Without it any file of the
 * commit could change before the tests run, so the gate refuses a policy
 * that does not require it.
 */
const GUARD: CheckName = 'test_files_only';

export interface QualityPolicyProps {
  /** A check that is not listed is skipped. */
  readonly requiredChecks: readonly CheckName[];
  /** How many runs in a row the new tests must pass. */
  readonly repeatedRuns: number;
  /** The least kill rate of the new tests, as a percentage. */
  readonly mutationThreshold: number;
}

function problemOf(props: QualityPolicyProps): string {
  const { requiredChecks, repeatedRuns, mutationThreshold } = props;
  if (new Set(requiredChecks).size !== requiredChecks.length) {
    return 'names a check twice';
  }
  if (!requiredChecks.every((check) => CHECK_NAMES.includes(check))) {
    return 'names a check the gate does not have';
  }
  if (!Number.isInteger(repeatedRuns) || repeatedRuns < 1) {
    return 'repeats the runs less than once';
  }
  const inRange = mutationThreshold >= 0 && mutationThreshold <= MAX_PERCENTAGE;
  return inRange ? '' : 'has a threshold that is not a percentage';
}

/**
 * The settings of the quality gate, fixed when an improvement is created.
 * They are part of what the improvement was asked to do, so they never
 * change afterwards.
 */
export class QualityPolicy extends ValueObject<QualityPolicyProps> {
  private constructor(props: QualityPolicyProps) {
    super(props);
  }

  public static create(props: QualityPolicyProps): QualityPolicy {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidImprovementValueError(`The quality policy ${problem}.`);
    }
    return new QualityPolicy({
      ...props,
      requiredChecks: Object.freeze([...props.requiredChecks]),
    });
  }

  /**
   * A policy a new request asks for. One the gate would refuse is refused
   * here, before any work starts. A stored policy is restored with
   * `create`, as it was asked for then.
   */
  public static requested(props: QualityPolicyProps): QualityPolicy {
    const policy = QualityPolicy.create(props);
    if (!policy.isUsable) {
      throw new InvalidImprovementValueError(
        `The quality policy does not require ${GUARD}, without which the ` +
          'gate applies no patch.',
      );
    }
    return policy;
  }

  /** Whether the gate can judge a patch under this policy at all. */
  public get isUsable(): boolean {
    return this.props.requiredChecks.includes(GUARD);
  }

  public get requiredChecks(): readonly CheckName[] {
    return this.props.requiredChecks;
  }

  public get repeatedRuns(): number {
    return this.props.repeatedRuns;
  }

  public get mutationThreshold(): number {
    return this.props.mutationThreshold;
  }
}
