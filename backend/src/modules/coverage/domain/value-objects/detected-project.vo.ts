import { InvalidScanParametersError } from '#coverage/domain/errors/invalid-scan-parameters.error';
import type { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';

/** The two runners the service supports. */
export const TEST_RUNNERS = ['jest', 'vitest'] as const;

export type TestRunnerName = (typeof TEST_RUNNERS)[number];

/** The one package manager the service installs with. */
export const PACKAGE_MANAGERS = ['npm'] as const;

type PackageManagerName = (typeof PACKAGE_MANAGERS)[number];

interface DetectedProjectProps {
  readonly testRunner: TestRunnerName;
  /** The exact version the lockfile holds. */
  readonly testRunnerVersion: string;
  readonly packageManager: PackageManagerName;
  /** The configuration of the runner, or `null` when it has none. */
  readonly configFile: FilePath | null;
}

/** What the files of a working copy say about how its tests run. */
export class DetectedProject extends ValueObject<DetectedProjectProps> {
  private constructor(props: DetectedProjectProps) {
    super(props);
  }

  public static create(props: DetectedProjectProps): DetectedProject {
    if (props.testRunnerVersion === '') {
      throw new InvalidScanParametersError(
        `The version of ${props.testRunner} is empty.`,
      );
    }
    return new DetectedProject(props);
  }

  public get testRunner(): TestRunnerName {
    return this.props.testRunner;
  }

  public get testRunnerVersion(): string {
    return this.props.testRunnerVersion;
  }

  public get packageManager(): PackageManagerName {
    return this.props.packageManager;
  }

  public get configFile(): FilePath | null {
    return this.props.configFile;
  }
}
