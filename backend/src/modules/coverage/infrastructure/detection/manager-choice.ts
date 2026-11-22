import type { PackageInstall } from '#coverage/application/ports/project-detector.port';
import type { PackageManagerName } from '#coverage/domain/value-objects/detected-project.vo';

/** A package of the manifest: its name and the range it is declared with. */
export interface DeclaredPackage {
  readonly name: string;
  readonly range: string;
}

/** The manager a project is installed with, and what it reads in the copy. */
export interface ManagerChoice {
  readonly name: PackageManagerName;
  /** Its lockfile, by its name at the root of the copy. */
  readonly lockfile: string;
  readonly install: PackageInstall;
  /** The version the lockfile holds for a declared package, or `null`. */
  readonly lockedVersion: (
    lockfile: string,
    declared: DeclaredPackage,
  ) => string | null;
}

/**
 * The cache of an install, inside the copy and so on the disk of the host
 * and gone with the copy. The home of a command is the folder in memory,
 * which the cache of a large project filled. Under `node_modules` no
 * runner, no compiler and no mutation tool looks into it.
 */
export const INSTALL_CACHE = 'node_modules/.cache/coverage-autopilot/install';

/**
 * Corepack fetches the exact pnpm or yarn it is named with, such as
 * `pnpm@10.34.9`, from the registry while the install has the network,
 * and checks the hash the name carries. The image has Corepack and no
 * manager, so nothing after the install can start one.
 */
export const COREPACK = 'corepack';

/**
 * A `.corepack.env` of the repository could send Corepack to another
 * registry for the program, so it is never read.
 */
export const COREPACK_ENVIRONMENT: Readonly<Record<string, string>> = {
  COREPACK_ENV_FILE: '0',
};
