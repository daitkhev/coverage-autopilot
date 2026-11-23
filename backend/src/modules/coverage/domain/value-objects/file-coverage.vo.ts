import { InvalidFileCoverageError } from '#coverage/domain/errors/invalid-file-coverage.error';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';

/** The two states of a file that a snapshot stores as a row. */
export type CountedFileState = 'measured' | 'no_executable_code';

interface FileCoverageProps {
  readonly path: FilePath;
  readonly state: CountedFileState;
  readonly counters: CoverageCounters;
  readonly uncovered: UncoveredCode;
}

/**
 * The numbers of one file of a snapshot: a file the report counted, or a
 * file of type declarations alone, whose counters are all zero. A file
 * with no numbers that can be trusted is an `UnmeasuredFile` instead.
 */
export class FileCoverage extends ValueObject<FileCoverageProps> {
  private constructor(props: FileCoverageProps) {
    super(props);
  }

  public static measured(props: {
    readonly path: FilePath;
    readonly counters: CoverageCounters;
    readonly uncovered: UncoveredCode;
  }): FileCoverage {
    if (props.counters.isEmpty()) {
      throw new InvalidFileCoverageError(
        `${props.path.value} has zero of zero in every counter, so it was ` +
          'not measured.',
      );
    }
    return new FileCoverage({ ...props, state: 'measured' });
  }

  public static noExecutableCode(path: FilePath): FileCoverage {
    return new FileCoverage({
      path,
      state: 'no_executable_code',
      counters: CoverageCounters.none(),
      uncovered: UncoveredCode.none(),
    });
  }

  public get path(): FilePath {
    return this.props.path;
  }

  public get state(): CountedFileState {
    return this.props.state;
  }

  public get counters(): CoverageCounters {
    return this.props.counters;
  }

  public get uncovered(): UncoveredCode {
    return this.props.uncovered;
  }

  /**
   * Only a measured file below the threshold can be improved. A file of
   * declarations alone has nothing to cover.
   */
  public canBeTarget(threshold: CoverageThreshold): boolean {
    return this.state === 'measured' && threshold.isAbove(this.counters);
  }
}
