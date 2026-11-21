import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { UndetectedMutant } from '#improvement/domain/value-objects/mutant.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';

/** `absent`: the project has no compiler or no configuration of one. */
export const TYPE_CHECK_STATES = ['passes', 'fails', 'absent'] as const;

export const TEST_RUN_STATES = ['passed', 'failed', 'timed_out'] as const;

/** Both runs of one improvement name the same tool and runner. */
interface MutationTool {
  readonly name: string;
  readonly version: string;
  readonly testRunner: string;
}

export interface MutationBaseline {
  readonly tool: MutationTool;
  /** Every mutant of the target file, detected or not. */
  readonly totalMutants: number;
  /** Names the whole set of mutants, so a run with another set is caught. */
  readonly mutantSetHash: string;
  readonly undetected: readonly UndetectedMutant[];
  /** The cache of the tool in the store of raw output, or `null`. */
  readonly cacheReference: string | null;
}

export interface VerificationBaselineProps {
  readonly commit: CommitSha;
  readonly targetFile: FilePath;
  readonly typeCheck: (typeof TYPE_CHECK_STATES)[number];
  readonly existingTests: (typeof TEST_RUN_STATES)[number];
  /** `null` when the policy does not require the mutation check. */
  readonly mutation: MutationBaseline | null;
}

function holdsItsMutants(mutation: MutationBaseline | null): boolean {
  return (
    mutation === null ||
    (Number.isInteger(mutation.totalMutants) &&
      mutation.undetected.length <= mutation.totalMutants)
  );
}

/**
 * What the commit of an improvement is like before any patch: whether it
 * type-checks, whether its tests pass, and which mutants of the target no
 * test detects. The gate measures it once in `analyzing`, and every
 * attempt is compared with it, so the improvement keeps it as it came.
 */
export class VerificationBaseline extends ValueObject<VerificationBaselineProps> {
  private constructor(props: VerificationBaselineProps) {
    super(props);
  }

  public static create(props: VerificationBaselineProps): VerificationBaseline {
    if (!holdsItsMutants(props.mutation)) {
      throw new InvalidImprovementValueError(
        'A mutation baseline counts at least the mutants it lists as ' +
          'undetected.',
      );
    }
    return new VerificationBaseline(props);
  }

  public get commit(): CommitSha {
    return this.props.commit;
  }

  public get targetFile(): FilePath {
    return this.props.targetFile;
  }

  public get typeCheck(): VerificationBaselineProps['typeCheck'] {
    return this.props.typeCheck;
  }

  public get existingTests(): VerificationBaselineProps['existingTests'] {
    return this.props.existingTests;
  }

  public get mutation(): MutationBaseline | null {
    return this.props.mutation;
  }
}
