/** The one secret of the generator: the variable the CLI logs in with. */
export interface GeneratorCredential {
  /** Such as `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. */
  readonly variable: string;
  readonly value: string;
}

/** How much of a working copy is searched for the credential after a run. */
interface CredentialScan {
  /** Written files past this number are not read, and the notes say so. */
  readonly maxFiles: number;
  /** A written file larger than this is not read, and the notes say so. */
  readonly maxFileBytes: number;
}

/** What the adapter of Claude Code takes from the settings of the service. */
export interface GeneratorSettings {
  /**
   * The program and its own first arguments, such as `["claude"]`, as the
   * image of the generator sandbox starts it.
   */
  readonly command: readonly [string, ...string[]];
  /**
   * The tools the CLI may use, as `--tools` names them. Its start report
   * must list exactly these.
   */
  readonly allowedTools: readonly string[];
  readonly credential: GeneratorCredential;
  /**
   * Variables the CLI gets besides those the adapter sets, such as the
   * `PATH` of the image. They cannot replace one the adapter sets.
   */
  readonly environment: Readonly<Record<string, string>>;
  readonly scan: CredentialScan;
}

/** The injection token of the settings of the generator. */
export const GENERATOR_SETTINGS = Symbol('GeneratorSettings');
