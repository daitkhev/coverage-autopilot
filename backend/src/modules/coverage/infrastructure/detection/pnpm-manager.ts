import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import { readText } from '#coverage/infrastructure/detection/copy-text';
import {
  type KeyLine,
  keyLinesOf,
  topKeysOf,
} from '#coverage/infrastructure/detection/indented-keys';
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

export const PNPM_LOCKFILE = 'pnpm-lock.yaml';

export const PNPM_WORKSPACE = 'pnpm-workspace.yaml';

/**
 * For a project whose manifest names no pnpm: the pnpm that writes each
 * format of the lockfile and installs it unchanged. pnpm 9 to 12 all
 * write 9.0, and 10 is the oldest of them that reads what 12 writes.
 */
const PNPM_OF_FORMAT: Readonly<Record<string, string>> = {
  '5.4': '7.33.7',
  '6.0': '8.15.9',
  '9.0': '10.34.9',
};

const SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]);

/** The project of the lockfiles from pnpm 9, a key of `importers`. */
const IMPORTER = ['importers', '.'];

/** pnpm 6 and later add the versions of the peers, as `4.1.12(vite@7.1.0)`. */
const PEERS = /[(_]/u;

/**
 * A package from a git repository, or from an archive of a host of git,
 * is built from its sources by its own scripts while pnpm installs it.
 */
const FROM_GIT =
  /^\s+resolution: \{[^}\n]*(?:\btype: git\b|tarball: https:\/\/(?:codeload\.github\.com|bitbucket\.org|gitlab\.com)\/)/mu;

/** pnpm 10 installs these and runs the hooks they bring as it starts. */
const CONFIG_DEPENDENCIES = 'configDependencies';

/**
 * The lockfile decides every version, and the switches keep every script
 * and the `.pnpmfile.cjs` of the repository from running. The store of
 * the packages is the cache of the install. pnpm switches to no other
 * version of itself, and writes a line for each step.
 */
function installArguments(): string[] {
  return [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--ignore-pnpmfile',
    '--store-dir',
    INSTALL_CACHE,
    '--config.manage-package-manager-versions=false',
    '--reporter=append-only',
  ];
}

function withoutImporter(path: readonly string[]): readonly string[] {
  return IMPORTER.every((key, index) => path[index] === key)
    ? path.slice(IMPORTER.length)
    : path;
}

/**
 * The version of a direct dependency, under its section as pnpm 6 and
 * later write it with a `version` of its own, or as pnpm 5 writes it.
 */
function isLockedVersion(line: KeyLine, name: string): boolean {
  const [section = '', key, last, ...deeper] = withoutImporter(line.path);
  const versionLine =
    last === 'version' || (last === undefined && line.value !== null);
  return (
    SECTIONS.has(section) && key === name && deeper.length === 0 && versionLine
  );
}

function lockedVersion(text: string, declared: DeclaredPackage): string | null {
  const line = keyLinesOf(text).find((each) =>
    isLockedVersion(each, declared.name),
  );
  return line?.value?.split(PEERS)[0] ?? null;
}

function formatOf(text: string): string {
  const line = keyLinesOf(text).find(
    ({ path }) => path.length === 1 && path[0] === 'lockfileVersion',
  );
  return line?.value ?? 'none';
}

function codeRefusal(
  root: string,
  lockfile: string,
): UnsupportedProject | null {
  const workspace = readText(root, PNPM_WORKSPACE);
  if (workspace !== null && topKeysOf(workspace).has(CONFIG_DEPENDENCIES)) {
    return unsupported(
      'install_runs_code',
      `${PNPM_WORKSPACE} names ${CONFIG_DEPENDENCIES}, whose hooks pnpm ` +
        'runs while it installs.',
    );
  }
  return FROM_GIT.test(lockfile)
    ? unsupported(
        'install_runs_code',
        `${PNPM_LOCKFILE} takes a package from a git repository, which ` +
          'pnpm builds from its sources by running its scripts.',
      )
    : null;
}

/**
 * pnpm at the version package.json names, with its hash, or else at the
 * version that writes the format of the lockfile.
 */
export function pnpmChoice(
  root: string,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  const lockfile = readText(root, PNPM_LOCKFILE) ?? '';
  const format = formatOf(lockfile);
  const fallback = PNPM_OF_FORMAT[format];
  const program =
    descriptor ?? (fallback === undefined ? null : `pnpm@${fallback}`);
  if (program === null) {
    return unsupported(
      'unsupported_package_manager',
      `${PNPM_LOCKFILE} has the format ${format}, which no pnpm the ` +
        'service knows writes, and package.json names no pnpm.',
    );
  }
  return (
    codeRefusal(root, lockfile) ?? {
      outcome: 'found',
      value: {
        name: 'pnpm',
        lockfile: PNPM_LOCKFILE,
        install: {
          command: [COREPACK, program, ...installArguments()],
          environment: COREPACK_ENVIRONMENT,
        },
        lockedVersion,
      },
    }
  );
}
