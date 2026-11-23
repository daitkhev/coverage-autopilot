import { InvalidScanParametersError } from '#coverage/domain/errors/invalid-scan-parameters.error';
import type { TestRunnerName } from '#coverage/domain/value-objects/detected-project.vo';
import { ValueObject } from '#kernel/primitives/value-object';

interface ScanParametersProps {
  readonly testRunner: TestRunnerName;
  readonly testRunnerVersion: string;
  /** Such as `babel` or `v8`: the same file counts differently under each. */
  readonly coverageProvider: string;
  /** The rule that chose the files to measure, as a stable text. */
  readonly fileListRule: string;
}

/**
 * The tools a snapshot was measured with. Coverage numbers describe a file
 * under one set of tools, so two measurements compare only when these are
 * equal.
 */
export class ScanParameters extends ValueObject<ScanParametersProps> {
  private constructor(props: ScanParametersProps) {
    super(props);
  }

  public static create(props: ScanParametersProps): ScanParameters {
    const empty = Object.entries(props)
      .filter(([, word]) => word === '')
      .map(([name]) => name);
    if (empty.length > 0) {
      throw new InvalidScanParametersError(
        `The scan parameters have an empty ${empty.join(' and ')}.`,
      );
    }
    return new ScanParameters(props);
  }

  public get testRunner(): TestRunnerName {
    return this.props.testRunner;
  }

  public get testRunnerVersion(): string {
    return this.props.testRunnerVersion;
  }

  public get coverageProvider(): string {
    return this.props.coverageProvider;
  }

  public get fileListRule(): string {
    return this.props.fileListRule;
  }
}
