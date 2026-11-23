/**
 * What the coverage module takes from the settings of the service. The
 * threshold is not one of them: each repository has its own, which the
 * module asks for when it judges a file.
 */
export interface CoverageSettings {
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
