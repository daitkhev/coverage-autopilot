import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidMutationBaselineError } from '#verification/domain/errors/invalid-mutation-baseline.error';
import type { Mutant } from '#verification/domain/value-objects/mutant.vo';

/**
 * `timeout` is its own status and never counts as detected. `error` is a
 * mutant the tool could not run, such as one that does not compile.
 */
export type MutantStatus =
  'killed' | 'survived' | 'no_coverage' | 'timeout' | 'error';

type UndetectedStatus = 'survived' | 'no_coverage';

/** The tool and its runner. Both runs of one improvement must name the same. */
export interface MutationTool {
  readonly name: string;
  readonly version: string;
  readonly testRunner: string;
}

interface MeasuredMutant {
  readonly mutant: Mutant;
  readonly status: MutantStatus;
}

export interface UndetectedMutant extends MeasuredMutant {
  readonly status: UndetectedStatus;
}

interface MutationBaselineProps {
  readonly tool: MutationTool;
  readonly totalMutants: number;
  readonly mutantSetHash: string;
  readonly undetected: readonly UndetectedMutant[];
  readonly cacheReference: string | null;
}

/** A run of the tool on the commit, before any patch. */
interface BaselineRun {
  readonly tool: MutationTool;
  readonly mutantSetHash: string;
  readonly mutants: readonly MeasuredMutant[];
  readonly cacheReference: string | null;
}

function isUndetected(measured: MeasuredMutant): measured is UndetectedMutant {
  return measured.status === 'survived' || measured.status === 'no_coverage';
}

function problemOf(props: MutationBaselineProps): string {
  const { tool, totalMutants, mutantSetHash, undetected } = props;
  if ([tool.name, tool.version, tool.testRunner].includes('')) {
    return 'it does not name its tool, the version and the runner';
  }
  if (mutantSetHash === '') {
    return 'it has no hash of its set of mutants';
  }
  const adds =
    Number.isInteger(totalMutants) && totalMutants >= undetected.length;
  return adds
    ? ''
    : `${String(totalMutants)} mutants cannot hold the ones undetected`;
}

/**
 * The mutants of the target file that no existing test detects: those that
 * survived and those no test runs. Measured once for an improvement, and
 * every attempt is compared with it.
 */
export class MutationBaseline extends ValueObject<MutationBaselineProps> {
  private constructor(props: MutationBaselineProps) {
    super(props);
  }

  public static create(props: MutationBaselineProps): MutationBaseline {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidMutationBaselineError(
        `The mutation baseline cannot be used: ${problem}.`,
      );
    }
    return new MutationBaseline({
      ...props,
      undetected: [...props.undetected],
    });
  }

  /** The baseline a complete run of the tool on the commit gives. */
  public static fromRun(run: BaselineRun): MutationBaseline {
    return MutationBaseline.create({
      tool: run.tool,
      totalMutants: run.mutants.length,
      mutantSetHash: run.mutantSetHash,
      undetected: run.mutants.filter(isUndetected),
      cacheReference: run.cacheReference,
    });
  }

  public get tool(): MutationTool {
    return this.props.tool;
  }

  /** Every mutant of the target file, detected or not. */
  public get totalMutants(): number {
    return this.props.totalMutants;
  }

  /** Names the whole set of mutants, whatever their statuses are. */
  public get mutantSetHash(): string {
    return this.props.mutantSetHash;
  }

  /** In the order the tool gave them, which is by place in the file. */
  public get undetected(): readonly UndetectedMutant[] {
    return this.props.undetected;
  }

  /** The cache of the tool in the artifact store. It only saves time. */
  public get cacheReference(): string | null {
    return this.props.cacheReference;
  }

  public isMeasuredBy(tool: MutationTool): boolean {
    const own = this.props.tool;
    return (
      own.name === tool.name &&
      own.version === tool.version &&
      own.testRunner === tool.testRunner
    );
  }
}
