import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';

/** What the coverage module takes from the settings of the service. */
export interface CoverageSettings {
  /** A measured file below it can be improved. 80% of lines by default. */
  readonly threshold: CoverageThreshold;
  /** The install is the one step with the network, so it has its own limit. */
  readonly installTimeoutMs: number;
  readonly testRunTimeoutMs: number;
  /**
   * Exactly the variables a command of a repository gets, such as the
   * `PATH` of the sandbox. Nothing of the service is inherited.
   */
  readonly commandEnvironment: Readonly<Record<string, string>>;
}

/** The injection token of the settings of the coverage module. */
export const COVERAGE_SETTINGS = Symbol('CoverageSettings');
