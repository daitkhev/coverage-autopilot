/** The first two numbers of a version of git, which decide whether it runs. */
export interface GitVersion {
  readonly major: number;
  readonly minor: number;
}

/**
 * The oldest git the service runs. Every call of git passes
 * `core.fsmonitor=false` so that no monitor starts, and git reads it as
 * "off" only from 2.36 on: an older git takes it for the name of a program
 * and starts that.
 */
export const OLDEST_GIT: GitVersion = { major: 2, minor: 36 };

/** As `git --version` answers, such as `git version 2.50.1 (Apple Git-155)`. */
const ANSWER = /^git version (\d+)\.(\d+)/u;

/** The version `git --version` answered, or `null` when it names none. */
export function gitVersionOf(answer: string): GitVersion | null {
  const numbers = ANSWER.exec(answer);
  if (numbers === null) {
    return null;
  }
  return { major: Number(numbers[1]), minor: Number(numbers[2]) };
}

/** Whether `version` came out before `other`. */
export function isOlder(version: GitVersion, other: GitVersion): boolean {
  return version.major === other.major
    ? version.minor < other.minor
    : version.major < other.major;
}

/** The version as people write it, such as `2.36`. */
export function versionText(version: GitVersion): string {
  return `${String(version.major)}.${String(version.minor)}`;
}
