/** The program that starts the container engine, and how it is started. */
export interface SandboxEngine {
  /** The program and its own first arguments, such as `["docker"]`. */
  readonly command: readonly [string, ...string[]];
  /**
   * The whole environment of that program. Nothing of the service is
   * inherited, so no credential of the service reaches the engine.
   */
  readonly environment: Readonly<Record<string, string>>;
}

interface SandboxLimits {
  readonly memoryMb: number;
  readonly cpus: number;
  /** Processes and threads at once, so a fork bomb stops at the limit. */
  readonly processes: number;
  /** The size of `/tmp`, which is kept in memory. */
  readonly scratchMb: number;
  /** How much of the output is kept, from its end. */
  readonly outputBytes: number;
}

/** What the service builds the image of a sandbox from. */
export interface ImageBuild {
  /** The file the engine builds the image from, as an absolute path. */
  readonly file: string;
}

/** Everything a sandbox is started with, as one value of the settings. */
export interface SandboxSettings {
  readonly engine: SandboxEngine;
  /**
   * The instance of the service, as each of its containers is labelled,
   * so a start finds the containers of its own instance and of no other.
   */
  readonly instance: string;
  readonly image: string;
  /**
   * Set for an image the service makes itself, which it builds when the
   * engine lacks it or has it from another file. Left out, the engine
   * pulls the image when it lacks it.
   */
  readonly build?: ImageBuild;
  /**
   * `<uid>:<gid>` the command runs as: never root, and the owner of the
   * working copies, so that it can write into them.
   */
  readonly user: string;
  readonly limits: SandboxLimits;
}

/** The injection token of the settings of the sandbox. */
export const SANDBOX_SETTINGS = Symbol('SandboxSettings');
