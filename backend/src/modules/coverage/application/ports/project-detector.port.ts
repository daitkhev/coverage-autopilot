import type { UnsupportedProjectReason } from '#coverage/application/contracts/coverage-public-api';
import type { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import type { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import type { FilePath } from '#kernel/primitives/file-path';

/** How the locked packages are installed: the one command with the network. */
export interface PackageInstall {
  /** The program and its arguments. */
  readonly command: readonly string[];
  /**
   * The variables the command gets besides those of the settings, such as
   * the switches of the manager that keep code of the repository from
   * running.
   */
  readonly environment: Readonly<Record<string, string>>;
}

export interface SupportedProject {
  readonly outcome: 'supported';
  readonly project: DetectedProject;
  /** The tools a measurement of this project uses, decided before any runs. */
  readonly parameters: ScanParameters;
  readonly install: PackageInstall;
  /** The source files a measurement covers, by the rule of the parameters. */
  readonly eligibleFiles: readonly FilePath[];
}

/** A repository the service reports and never changes into one it measures. */
export interface UnsupportedProject {
  readonly outcome: 'unsupported';
  readonly reason: UnsupportedProjectReason;
  readonly detail: string;
}

export type ProjectDetection = SupportedProject | UnsupportedProject;

/**
 * Reads the files of a working copy, such as the package manifest, the
 * lockfile and the configuration of the runner. It runs nothing, so it is
 * safe on the code of any repository. For yarn 2 and later it writes one
 * file into the copy: the settings of the repository without those that
 * load its code, which the install reads instead.
 */
export interface ProjectDetector {
  detect(workingCopyPath: string): Promise<ProjectDetection>;
}

/** The injection token of the project detector. */
export const PROJECT_DETECTOR = Symbol('ProjectDetector');
