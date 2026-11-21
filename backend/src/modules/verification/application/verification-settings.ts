/** What the verification module takes from the settings of the service. */
export interface VerificationSettings {
  /** The compiler reads the whole project, so it has a limit of its own. */
  readonly typeCheckTimeoutMs: number;
  /** A mutation tool has no limit for a whole run, so the gate gives one. */
  readonly mutationRunTimeoutMs: number;
  /**
   * How many surviving mutants a report names at most, so the feedback
   * does not use up the token budget of the next attempt.
   */
  readonly survivingMutantLimit: number;
  /**
   * Exactly the variables a command of a repository gets, such as the
   * `PATH` of the sandbox. Nothing of the service is inherited.
   */
  readonly commandEnvironment: Readonly<Record<string, string>>;
}

/** The injection token of the settings of the verification module. */
export const VERIFICATION_SETTINGS = Symbol('VerificationSettings');
