import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidQualityPolicyError } from '#verification/domain/errors/invalid-quality-policy.error';
import type { CheckName } from '#verification/domain/value-objects/check-result.vo';

const MAX_PERCENTAGE = 100;

/**
 * The check that decides whether a patch is applied at all. Without it any
 * file of the commit could be changed before the tests run.
 */
const GUARD: CheckName = 'test_files_only';

interface QualityPolicyProps {
  readonly requiredChecks: readonly CheckName[];
  readonly repeatedRuns: number;
  readonly mutationThreshold: number;
}

function problemOf(props: QualityPolicyProps): string {
  const { requiredChecks, repeatedRuns, mutationThreshold } = props;
  if (!requiredChecks.includes(GUARD)) {
    return `it does not require ${GUARD}, which decides whether a patch is applied`;
  }
  if (!Number.isInteger(repeatedRuns) || repeatedRuns < 1) {
    return `${String(repeatedRuns)} is not a number of runs from 1`;
  }
  const isShare =
    Number.isFinite(mutationThreshold) &&
    mutationThreshold >= 0 &&
    mutationThreshold <= MAX_PERCENTAGE;
  return isShare ? '' : `${String(mutationThreshold)} is not a percentage`;
}

/**
 * The settings of the gate, fixed when an improvement is created: which
 * checks are required, how many runs in a row the new tests must pass,
 * and the least kill rate of the new tests as a percentage.
 */
export class QualityPolicy extends ValueObject<QualityPolicyProps> {
  private constructor(props: QualityPolicyProps) {
    super(props);
  }

  public static create(props: QualityPolicyProps): QualityPolicy {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidQualityPolicyError(
        `The quality policy cannot be used: ${problem}.`,
      );
    }
    return new QualityPolicy({
      ...props,
      requiredChecks: [...new Set(props.requiredChecks)],
    });
  }

  /** Each required check once. A check that is not listed is skipped. */
  public get requiredChecks(): readonly CheckName[] {
    return this.props.requiredChecks;
  }

  public get repeatedRuns(): number {
    return this.props.repeatedRuns;
  }

  public get mutationThreshold(): number {
    return this.props.mutationThreshold;
  }

  public requires(check: CheckName): boolean {
    return this.props.requiredChecks.includes(check);
  }
}
