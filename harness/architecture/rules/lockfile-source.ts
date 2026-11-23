import type { Finding } from '#harness/architecture/finding';
import type { Project, Rule } from '#harness/architecture/project';
import { isRecord, type JsonRecord } from '#harness/shared/json';
import type { Structure } from '#harness/shared/structure';

const LOCKFILE = 'package-lock.json';

/** The one shape of a lockfile that is read: every package is an entry. */
const VERSION = 3;

/** The one place a package may come from. */
const REGISTRY = 'https://registry.npmjs.org/';

/** The folder of an installed package. What follows it is the name. */
const MODULES = 'node_modules/';

const CHECKSUM = /^sha512-[A-Za-z0-9+/]+=*$/;

/** The address the registry gives to one version of one package. */
function registryAddress(name: string, version: string): string {
  const file = name.slice(name.lastIndexOf('/') + 1);
  return `${REGISTRY}${name}/-/${file}-${version}.tgz`;
}

/**
 * An installed package is what its own name and version say it is. A name
 * stands for another package only when the policy lists it.
 */
function packageProblem(
  key: string,
  entry: JsonRecord,
  aliases: ReadonlyMap<string, string>,
): string | undefined {
  const name = key.slice(key.lastIndexOf(MODULES) + MODULES.length);
  const real = aliases.get(name) ?? name;
  const address = registryAddress(real, String(entry['version']));
  if (entry['resolved'] !== address) {
    return 'does not come from the npm registry under its own name and version.';
  }
  return CHECKSUM.test(String(entry['integrity']))
    ? undefined
    : 'has no checksum.';
}

function problemOf(
  key: string,
  entry: unknown,
  structure: Structure,
): string | undefined {
  if (!isRecord(entry)) {
    return 'is not an object.';
  }
  if (entry['link'] === true) {
    return structure.workspaces.has(String(entry['resolved']))
      ? undefined
      : 'is a link to a folder that is not a workspace.';
  }
  if (key.includes(MODULES)) {
    return packageProblem(key, entry, structure.packageAliases);
  }
  return key === '' || structure.workspaces.has(key)
    ? undefined
    : 'is a folder that is not a workspace.';
}

function problemsOf(lockfile: unknown, structure: Structure): string[] {
  const packages = isRecord(lockfile) ? lockfile['packages'] : undefined;
  if (!isRecord(lockfile) || lockfile['lockfileVersion'] !== VERSION) {
    return [`The lockfile is not of version ${String(VERSION)}.`];
  }
  if (!isRecord(packages)) {
    return ['The lockfile has no "packages".'];
  }
  return Object.entries(packages).flatMap(([key, entry]) => {
    const problem = problemOf(key, entry, structure);
    return problem === undefined ? [] : [`"${key}" ${problem}`];
  });
}

function checkWith(structure: Structure, project: Project): Finding[] {
  if (project.lockfile === undefined) {
    return [];
  }
  return problemsOf(project.lockfile, structure).map((detail) => ({
    rule: 'lockfile-source',
    path: LOCKFILE,
    line: 1,
    detail,
  }));
}

/**
 * Every package of the lockfile comes from the npm registry under its own
 * name and version, with a checksum. A path, a git address, an archive
 * from elsewhere and a name that stands for another package are refused,
 * but for the names the policy lists.
 * This says where a package comes from, and not that it is safe.
 */
export function lockfileSource(structure: Structure): Rule {
  return {
    id: 'lockfile-source',
    check: (project) => checkWith(structure, project),
  };
}
