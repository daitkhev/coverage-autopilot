import type {
  InstallMode,
  UnsupportedProject,
} from '#coverage/application/ports/project-detector.port';
import { readText } from '#coverage/infrastructure/detection/copy-text';
import {
  type KeyLine,
  keyLinesOf,
  topKeysOf,
} from '#coverage/infrastructure/detection/indented-keys';
import {
  type CopyToInstall,
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
 * pnpm keeps the checksum of the `.pnpmfile.cjs` it ran in the lockfile.
 * pnpm 10.34.9 failed a frozen install with `--ignore-pnpmfile` on such a
 * lockfile, since its hooks may have changed what it resolved.
 */
const PNPMFILE_HOOKED = /^pnpmfileChecksum:/mu;

/** Sandboxed, no script and no `.pnpmfile.cjs` of the repository runs. */
const CODE_SWITCHES: Readonly<Record<InstallMode, readonly string[]>> = {
  sandboxed: ['--ignore-scripts', '--ignore-pnpmfile'],
  trusted: [],
};

/**
 * The lockfile decides every version. The store of the packages is the
 * cache of the install. pnpm switches to no other version of itself, and
 * writes a line for each step.
 */
function installArguments(mode: InstallMode): string[] {
  return [
    'install',
    '--frozen-lockfile',
    ...CODE_SWITCHES[mode],
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

/** What in the copy would run code while pnpm installs, or `null`. */
function codeFoundIn(root: string, lockfile: string): string | null {
  const workspace = readText(root, PNPM_WORKSPACE) ?? '';
  if (topKeysOf(workspace).has(CONFIG_DEPENDENCIES)) {
    return (
      `${PNPM_WORKSPACE} names ${CONFIG_DEPENDENCIES}, whose hooks pnpm ` +
      'runs while it installs.'
    );
  }
  if (PNPMFILE_HOOKED.test(lockfile)) {
    return (
      `${PNPM_LOCKFILE} was written with the hooks of a .pnpmfile.cjs, ` +
      'which pnpm runs while it installs, and a frozen install without ' +
      'them fails.'
    );
  }
  return FROM_GIT.test(lockfile)
    ? `${PNPM_LOCKFILE} takes a package from a git repository, which ` +
        'pnpm builds from its sources by running its scripts.'
    : null;
}

/** What would run code is a reason to refuse a sandboxed install alone. */
function codeRefusal(
  { root, mode }: CopyToInstall,
  lockfile: string,
): UnsupportedProject | null {
  const found = mode === 'sandboxed' ? codeFoundIn(root, lockfile) : null;
  return found === null ? null : unsupported('install_runs_code', found);
}

/**
 * pnpm at the version package.json names, with its hash, or else at the
 * version that writes the format of the lockfile.
 */
export function pnpmChoice(
  copy: CopyToInstall,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  const lockfile = readText(copy.root, PNPM_LOCKFILE) ?? '';
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
    codeRefusal(copy, lockfile) ?? {
      outcome: 'found',
      value: {
        name: 'pnpm',
        lockfile: PNPM_LOCKFILE,
        install: {
          command: [COREPACK, program, ...installArguments(copy.mode)],
          environment: COREPACK_ENVIRONMENT,
        },
        lockedVersion,
      },
    }
  );
}
