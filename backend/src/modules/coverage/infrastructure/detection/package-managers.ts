import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import { hasFile } from '#coverage/infrastructure/detection/copy-text';
import type {
  CopyToInstall,
  ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import {
  NPM_LOCKFILES,
  npmChoice,
} from '#coverage/infrastructure/detection/npm-manager';
import type { PackageManifest } from '#coverage/infrastructure/detection/package-manifest.schema';
import {
  PNPM_LOCKFILE,
  pnpmChoice,
} from '#coverage/infrastructure/detection/pnpm-manager';
import {
  type Found,
  unsupported,
} from '#coverage/infrastructure/detection/runner-choice';
import { YARN_LOCKFILE } from '#coverage/infrastructure/detection/yarn-classic';
import { yarnChoice } from '#coverage/infrastructure/detection/yarn-manager';

/** What package.json asks for: a manager, and an exact program of it. */
interface AskedManager {
  readonly name: string;
  /** The field itself, such as `pnpm@10.34.9+sha512.…`, or `null`. */
  readonly descriptor: string | null;
}

type Choice = Found<ManagerChoice> | UnsupportedProject;

/** The lockfiles that tell a manager, those of a manager in its order. */
const LOCKFILES: readonly (readonly [string, string])[] = [
  ...NPM_LOCKFILES.map((name) => [name, 'npm'] as const),
  [PNPM_LOCKFILE, 'pnpm'],
  [YARN_LOCKFILE, 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

/**
 * The `packageManager` field of Corepack: a name, an exact version and
 * maybe the hash of the program. A range or an address is refused, since
 * the program would not be the one the repository asks for.
 */
const FIELD =
  /^(?<name>[a-z]+)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?(?:\+sha\d+\.[0-9a-f]+)?$/u;

/** npm comes with the image, whatever version the field names. */
const NPM_FIELD = /^npm(?:@|$)/u;

const INSTALLERS: Readonly<
  Record<
    string,
    (copy: CopyToInstall, asked: AskedManager, lockfile: string) => Choice
  >
> = {
  npm: (copy, _asked, lockfile) => ({
    outcome: 'found',
    value: npmChoice(lockfile, copy.mode),
  }),
  pnpm: (copy, asked) => pnpmChoice(copy, asked.descriptor),
  yarn: (copy, asked) => yarnChoice(copy, asked.descriptor),
};

const LIST = new Intl.ListFormat('en');

const SUPPORTED = LIST.format(Object.keys(INSTALLERS));

function askedOf(field: string): AskedManager | UnsupportedProject {
  if (NPM_FIELD.test(field)) {
    return { name: 'npm', descriptor: null };
  }
  const name = FIELD.exec(field)?.groups?.['name'];
  return name === undefined
    ? unsupported(
        'unsupported_package_manager',
        `package.json names the package manager "${field}", which is not ` +
          'a name with an exact version.',
      )
    : { name, descriptor: field };
}

/** The lockfile of each manager the copy has one of, in the order above. */
function lockfilesIn(root: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [lockfile, manager] of LOCKFILES) {
    if (!found.has(manager) && hasFile(root, lockfile)) {
      found.set(manager, lockfile);
    }
  }
  return found;
}

/** With no field, the one manager a lockfile tells, if exactly one does. */
function guessed(
  lockfiles: Map<string, string>,
): AskedManager | UnsupportedProject {
  const [only, ...others] = lockfiles.keys();
  if (only === undefined) {
    return unsupported('no_lockfile', 'The repository has no lockfile.');
  }
  return others.length === 0
    ? { name: only, descriptor: null }
    : unsupported(
        'unsupported_package_manager',
        `The repository has the lockfiles of ${LIST.format([only, ...others])}, ` +
          'and package.json names no packageManager to choose one.',
      );
}

function installedWith(
  copy: CopyToInstall,
  asked: AskedManager,
  lockfiles: Map<string, string>,
): Choice {
  const installer = INSTALLERS[asked.name];
  const lockfile = lockfiles.get(asked.name);
  if (installer === undefined) {
    return unsupported(
      'unsupported_package_manager',
      `The repository is installed with ${asked.name}, and only ` +
        `${SUPPORTED} are supported.`,
    );
  }
  return lockfile === undefined
    ? unsupported(
        'no_lockfile',
        `package.json names ${asked.name}, and the repository has no ` +
          `lockfile of ${asked.name}.`,
      )
    : installer(copy, asked, lockfile);
}

/**
 * The manager the project is installed with: the one package.json names
 * in `packageManager`, or else the one whose lockfile the copy has. The
 * lockfile of that manager must be there, since it decides every version.
 */
export function chooseManager(
  copy: CopyToInstall,
  manifest: PackageManifest,
): Choice {
  const lockfiles = lockfilesIn(copy.root);
  const field = manifest.packageManager;
  const asked = field === undefined ? guessed(lockfiles) : askedOf(field);
  return 'outcome' in asked ? asked : installedWith(copy, asked, lockfiles);
}
