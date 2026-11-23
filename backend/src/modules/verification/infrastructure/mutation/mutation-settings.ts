/** What the StrykerJS adapter takes from the settings of the service. */
export interface MutationSettings {
  /**
   * The version of StrykerJS and of its runner plugin, which are released
   * together: 10.1.1 by default, the version the design was measured with.
   */
  readonly toolVersion: string;
  /**
   * The test runners of one run at once, 2 by default. It is always
   * written: left to the tool, it starts one for each processor but one,
   * and the memory of a run grows with each runner.
   */
  readonly concurrency: number;
  /**
   * A mutant times out after the time of its tests in the initial run,
   * times the factor, plus the milliseconds: `timeoutFactor` and
   * `timeoutMS` of StrykerJS, 1.5 and 5000 by default. Only the time of
   * one mutant is limited by the tool, never the whole run.
   */
  readonly mutantTimeoutFactor: number;
  readonly mutantTimeoutMs: number;
  /** The install is the one step with the network, so it has its own limit. */
  readonly installTimeoutMs: number;
  /**
   * Exactly the variables a command of a repository gets, such as the
   * `PATH` and the `HOME` of the sandbox. Nothing of the service is
   * inherited.
   */
  readonly commandEnvironment: Readonly<Record<string, string>>;
}

/** The injection token of the settings of the mutation adapter. */
export const MUTATION_SETTINGS = Symbol('MutationSettings');
