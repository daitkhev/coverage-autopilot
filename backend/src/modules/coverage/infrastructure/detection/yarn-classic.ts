import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import { unquoted } from '#coverage/infrastructure/detection/indented-keys';
import {
  COREPACK,
  COREPACK_ENVIRONMENT,
  type DeclaredPackage,
  INSTALL_CACHE,
  type ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import {
  type Found,
  unsupported,
} from '#coverage/infrastructure/detection/runner-choice';

export const YARN_LOCKFILE = 'yarn.lock';

/**
 * Every yarn starts the program a `yarnPath` of `.yarnrc.yml` names, and
 * yarn 1 also the one a `yarn-path` of `.yarnrc` names: code of the
 * repository, unless this says no.
 */
export const YARN_ENVIRONMENT: Readonly<Record<string, string>> = {
  ...COREPACK_ENVIRONMENT,
  YARN_IGNORE_PATH: '1',
};

/** For a project whose manifest names no yarn: the last yarn 1. */
const CLASSIC_VERSION = '1.22.22';

/**
 * A package from a git repository, which yarn 1 prepares by installing it
 * and running its scripts. An archive from a host of git is unpacked as
 * it is.
 */
const FROM_GIT = /^\s+resolved "(?:git[+:@]|ssh:|[^"#]*\.git[#"])/mu;

/** The line that starts an entry: the descriptors it resolves, and a colon. */
const ENTRY = /^(?<descriptors>[^\s#].*):$/u;

const VERSION = /^ {2}version "(?<version>[^"]+)"$/u;

/**
 * The lockfile decides every version, and no script runs. A package that
 * asks for another version of Node than the image has is installed as npm
 * installs it, since the tests of the project decide whether it works.
 * The cache of the install is the one of the service.
 */
function installArguments(): string[] {
  return [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--ignore-engines',
    '--non-interactive',
    '--cache-folder',
    INSTALL_CACHE,
  ];
}

function descriptorsOf(line: string): readonly string[] | null {
  const descriptors = ENTRY.exec(line)?.groups?.['descriptors'];
  return descriptors === undefined
    ? null
    : descriptors.split(', ').map(unquoted);
}

/**
 * The version of the entry that resolves the package at the range of the
 * manifest, as `jest@^30.5.2`. An entry lists each range it resolves.
 */
function lockedVersion(text: string, declared: DeclaredPackage): string | null {
  const wanted = `${declared.name}@${declared.range}`;
  let inEntry = false;
  for (const line of text.split(/\r?\n/u)) {
    inEntry = descriptorsOf(line)?.includes(wanted) ?? inEntry;
    const version = inEntry
      ? VERSION.exec(line)?.groups?.['version']
      : undefined;
    if (version !== undefined) {
      return version;
    }
  }
  return null;
}

/** yarn 1 at the version package.json names, or else the last yarn 1. */
export function classicChoice(
  lockfile: string,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  if (FROM_GIT.test(lockfile)) {
    return unsupported(
      'install_runs_code',
      `${YARN_LOCKFILE} takes a package from a git repository, which yarn ` +
        'prepares by running its scripts.',
    );
  }
  const program = descriptor ?? `yarn@${CLASSIC_VERSION}`;
  return {
    outcome: 'found',
    value: {
      name: 'yarn',
      lockfile: YARN_LOCKFILE,
      install: {
        command: [COREPACK, program, ...installArguments()],
        environment: YARN_ENVIRONMENT,
      },
      lockedVersion,
    },
  };
}
