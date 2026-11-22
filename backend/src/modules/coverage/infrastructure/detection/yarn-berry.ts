import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import {
  type KeyLine,
  keyLinesOf,
} from '#coverage/infrastructure/detection/indented-keys';
import {
  COREPACK,
  type DeclaredPackage,
  type ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import {
  type Found,
  unsupported,
} from '#coverage/infrastructure/detection/runner-choice';
import {
  YARN_ENVIRONMENT,
  YARN_LOCKFILE,
} from '#coverage/infrastructure/detection/yarn-classic';
import {
  CLEAN_SETTINGS,
  cleanSettingsIn,
} from '#coverage/infrastructure/detection/yarn-settings';

/**
 * For a project whose manifest names no yarn: the yarn that writes each
 * format of the lockfile. An immutable install refuses a lockfile that
 * its yarn would write in another format, so the version must match.
 */
const BERRY_OF_FORMAT: Readonly<Record<string, string>> = {
  '6': '3.8.7',
  '8': '4.13.0',
  '9': '4.14.1',
  '10': '4.18.1',
};

/** The format is the `version` under this key. */
const FORMAT = ['__metadata', 'version'];

/**
 * yarn keeps its cache beside the lockfile, as a project that commits its
 * packages does. Under `node_modules` the linker of yarn removed what it
 * had just fetched.
 */
const CACHE_FOLDER = '.yarn/cache';

/**
 * The settings the service wrote, no script, no cache or mirror outside
 * the copy, no report sent, and a package whose checksum differs from the
 * lockfile refused. The packages go into `node_modules`, whatever the
 * settings say.
 */
const BERRY_ENVIRONMENT: Readonly<Record<string, string>> = {
  ...YARN_ENVIRONMENT,
  YARN_RC_FILENAME: CLEAN_SETTINGS,
  YARN_ENABLE_SCRIPTS: '0',
  YARN_ENABLE_GLOBAL_CACHE: '0',
  YARN_ENABLE_MIRROR: '0',
  YARN_CACHE_FOLDER: CACHE_FOLDER,
  YARN_ENABLE_TELEMETRY: '0',
  YARN_CHECKSUM_BEHAVIOR: 'throw',
  YARN_NODE_LINKER: 'node-modules',
};

/**
 * A package from git, which yarn packs by running its scripts, or one a
 * script of the repository makes. Inside a patch the descriptor is
 * escaped.
 */
const RUNS_CODE =
  /^\s+resolution: "[^"\n]*(?:(?:#|%23)commit(?:=|%3D)|@exec(?::|%3A))/mu;

/** A range with no protocol is one of the registry. */
const PROTOCOL = /^[a-z]+:/u;

/** The lockfile decides every version, and no package is built. */
function installArguments(): string[] {
  return ['install', '--immutable', '--mode=skip-build'];
}

function descriptorOf(declared: DeclaredPackage): string {
  const range = PROTOCOL.test(declared.range)
    ? declared.range
    : `npm:${declared.range}`;
  return `${declared.name}@${range}`;
}

/** A `version` under an entry whose key lists the descriptor. */
function isVersionOf(line: KeyLine, descriptor: string): boolean {
  const [entry = '', key, ...deeper] = line.path;
  return (
    key === 'version' &&
    deeper.length === 0 &&
    entry.split(', ').includes(descriptor)
  );
}

function lockedVersion(text: string, declared: DeclaredPackage): string | null {
  const descriptor = descriptorOf(declared);
  return (
    keyLinesOf(text).find((line) => isVersionOf(line, descriptor))?.value ??
    null
  );
}

function formatOf(lockfile: string): string {
  const line = keyLinesOf(lockfile).find(
    ({ path }) =>
      path.length === FORMAT.length &&
      FORMAT.every((key, index) => path[index] === key),
  );
  return line?.value ?? 'none';
}

function programOf(
  lockfile: string,
  descriptor: string | null,
): string | UnsupportedProject {
  if (descriptor !== null) {
    return descriptor;
  }
  const format = formatOf(lockfile);
  const fallback = BERRY_OF_FORMAT[format];
  return fallback === undefined
    ? unsupported(
        'unsupported_package_manager',
        `${YARN_LOCKFILE} has the format ${format}, which no yarn the ` +
          'service knows writes, and package.json names no yarn.',
      )
    : `yarn@${fallback}`;
}

/**
 * yarn 2 or later at the version package.json names, or else at the
 * version that writes the format of the lockfile. It reads the settings
 * the service writes, those of the repository without the ones that load
 * its code.
 */
export function berryChoice(
  root: string,
  lockfile: string,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  const program = programOf(lockfile, descriptor);
  if (typeof program !== 'string') {
    return program;
  }
  if (RUNS_CODE.test(lockfile)) {
    return unsupported(
      'install_runs_code',
      `${YARN_LOCKFILE} takes a package from a git repository, which yarn ` +
        'packs by running its scripts, or one that a script makes.',
    );
  }
  return (
    cleanSettingsIn(root) ?? {
      outcome: 'found',
      value: {
        name: 'yarn',
        lockfile: YARN_LOCKFILE,
        install: {
          command: [COREPACK, program, ...installArguments()],
          environment: BERRY_ENVIRONMENT,
        },
        lockedVersion,
      },
    }
  );
}
