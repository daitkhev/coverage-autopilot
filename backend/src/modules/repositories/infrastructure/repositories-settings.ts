/** How the service starts one program. */
export interface ToolSettings {
  /**
   * The program and the arguments that come before those of every call,
   * such as `["git"]`. A bare name is looked for on the `PATH` of the
   * environment below, not on the one of the service.
   */
  readonly command: readonly string[];
  /** Exactly the variables the program gets. Nothing is inherited. */
  readonly environment: Readonly<Record<string, string>>;
  /** A call that runs longer than this is stopped. */
  readonly timeoutMs: number;
}

/** What the repositories module needs from the configuration. */
export interface RepositoriesSettings {
  /**
   * An absolute folder of the service alone. Mirrors and working copies
   * are made under it, and nothing else is.
   */
  readonly workingCopiesRoot: string;
  readonly git: ToolSettings;
  readonly gh: ToolSettings;
  /**
   * The names of variables in either environment whose values are
   * secrets, such as `GH_TOKEN`. A value of one never appears in an error
   * message or in the output the module keeps.
   */
  readonly secretVariables: readonly string[];
}

/** The injection token of the settings of the repositories module. */
export const REPOSITORIES_SETTINGS = Symbol('RepositoriesSettings');

/** The values the module hides, longest first so none is half hidden. */
export function secretValuesOf(settings: RepositoriesSettings): string[] {
  const environments = [settings.git.environment, settings.gh.environment];
  return environments
    .flatMap((environment) =>
      settings.secretVariables.map((name) => environment[name] ?? ''),
    )
    .filter((value) => value !== '')
    .sort((left, right) => right.length - left.length);
}
