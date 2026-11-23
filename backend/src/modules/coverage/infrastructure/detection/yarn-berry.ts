import type {
  InstallMode,
  UnsupportedProject,
} from '#coverage/application/ports/project-detector.port';
import {
  type KeyLine,
  keyLinesOf,
} from '#coverage/infrastructure/detection/indented-keys';
import {
  type CopyToInstall,
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
  linkerRefusalIn,
} from '#coverage/infrastructure/detection/yarn-settings';

/**
 * For a project whose manifest names no yarn: the yarn that writes each
 * format of the lockfile. An immutable install refuses a lockfile that
 * its yarn would write in another format, so the version must match.
 * Corepack checks no signature of yarn 2 or later, so each carries the
 * hash of its program, which the registry of npm and the site of yarn
 * both served.
 */
const BERRY_OF_FORMAT: Readonly<Record<string, string>> = {
  '6': 'yarn@3.8.7+sha512.bbe7e310ff7fd20dc63b111110f96fe18192234bb0d4f10441fa6b85d2b644c8923db8fbe6d7886257ace948440ab1f83325ad02af457a1806cdc97f03d2508e',
  '8': 'yarn@4.13.0+sha512.5c20ba010c99815433e5c8453112165e673f1c7948d8d2b267f4b5e52097538658388ebc9f9580656d9b75c5cc996f990f611f99304a2197d4c56d21eea370e7',
  '9': 'yarn@4.14.1+sha512.64df448055b2d37ba269d7db535a469b8da93f8ef1140c25fd7a83c00a8fbaacb214ca0e02553b92a2c54cef78bb67d0b4817fab02001df0e24fac0faccc3b42',
  '10': 'yarn@4.18.1+sha512.b2e1e7524f654f2749d32b4ebcb4622473cb5bcbc485df2007e12a154e50162a4d795526768bc5f5b8f81717bfd79deb2472813d86fb5ae2eb551fa9c872b08f',
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
 * Whatever the mode: no cache or mirror outside the copy, no report sent,
 * and a package whose checksum differs from the lockfile refused. The
 * packages go into `node_modules`, whatever the settings say.
 */
const LOCAL_ENVIRONMENT: Readonly<Record<string, string>> = {
  YARN_ENABLE_GLOBAL_CACHE: '0',
  YARN_ENABLE_MIRROR: '0',
  YARN_CACHE_FOLDER: CACHE_FOLDER,
  YARN_ENABLE_TELEMETRY: '0',
  YARN_CHECKSUM_BEHAVIOR: 'throw',
  YARN_NODE_LINKER: 'node-modules',
};

/**
 * Sandboxed, yarn reads the settings the service wrote and runs no
 * script. Trusted, it reads those of the repository, with its own yarn,
 * plugins and constraints, and runs the scripts.
 */
const BERRY_ENVIRONMENT: Readonly<
  Record<InstallMode, Readonly<Record<string, string>>>
> = {
  sandboxed: {
    ...YARN_ENVIRONMENT.sandboxed,
    YARN_RC_FILENAME: CLEAN_SETTINGS,
    YARN_ENABLE_SCRIPTS: '0',
    ...LOCAL_ENVIRONMENT,
  },
  trusted: { ...YARN_ENVIRONMENT.trusted, ...LOCAL_ENVIRONMENT },
};

/**
 * `YARN_ENABLE_SCRIPTS=0` alone still ran the `postinstall` of the root,
 * so a sandboxed install builds no package at all.
 */
const BUILD_SWITCHES: Readonly<Record<InstallMode, readonly string[]>> = {
  sandboxed: ['--mode=skip-build'],
  trusted: [],
};

/**
 * Sandboxed, the settings are read without what loads code of the
 * repository. Trusted, they are read as they are, and only the linker is
 * the service's to judge.
 */
const SETTINGS_REFUSAL: Readonly<
  Record<InstallMode, (root: string) => UnsupportedProject | null>
> = {
  sandboxed: cleanSettingsIn,
  trusted: linkerRefusalIn,
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

/** The lockfile decides every version. */
function installArguments(mode: InstallMode): string[] {
  return ['install', '--immutable', ...BUILD_SWITCHES[mode]];
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
  return (
    BERRY_OF_FORMAT[format] ??
    unsupported(
      'unsupported_package_manager',
      `${YARN_LOCKFILE} has the format ${format}, which no yarn the ` +
        'service knows writes, and package.json names no yarn.',
    )
  );
}

/**
 * yarn 2 or later at the version package.json names, or else at the
 * version that writes the format of the lockfile. Sandboxed, it reads the
 * settings the service writes, those of the repository without the ones
 * that load its code, and a package from git or from a script is a
 * reason to refuse.
 */
export function berryChoice(
  { root, mode }: CopyToInstall,
  lockfile: string,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  const program = programOf(lockfile, descriptor);
  if (typeof program !== 'string') {
    return program;
  }
  if (mode === 'sandboxed' && RUNS_CODE.test(lockfile)) {
    return unsupported(
      'install_runs_code',
      `${YARN_LOCKFILE} takes a package from a git repository, which yarn ` +
        'packs by running its scripts, or one that a script makes.',
    );
  }
  return (
    SETTINGS_REFUSAL[mode](root) ?? {
      outcome: 'found',
      value: {
        name: 'yarn',
        lockfile: YARN_LOCKFILE,
        install: {
          command: [COREPACK, program, ...installArguments(mode)],
          environment: BERRY_ENVIRONMENT[mode],
        },
        lockedVersion,
      },
    }
  );
}
