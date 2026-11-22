import { join } from 'node:path';

import { HarnessError } from '#harness/shared/harness.error';
import {
  isRecord,
  type JsonRecord,
  readJsonRecord,
  recordAt,
  stringAt,
  stringListAt,
} from '#harness/shared/json';

const MANIFEST = 'package.json';

/** A package of this repository: it is put into the built files. */
const OWN_SCOPE = '@coverage-autopilot/';

/** What npm reads of the built package. */
export interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly type: 'module';
  readonly engines: JsonRecord;
  readonly dependencies: Readonly<Record<string, string>>;
}

function dependenciesOf(manifest: JsonRecord): [string, string][] {
  const dependencies = manifest['dependencies'];
  if (!isRecord(dependencies)) {
    return [];
  }
  return Object.entries(dependencies)
    .filter(([name]) => !name.startsWith(OWN_SCOPE))
    .map(([name, version]) => [name, String(version)]);
}

/**
 * The packages of npm every workspace needs when it runs, in the order of
 * their names. One package at two versions cannot be installed as one
 * package, so it stops the build.
 */
function sharedDependencies(
  manifests: readonly JsonRecord[],
): Record<string, string> {
  const found = new Map<string, string>();
  for (const [name, version] of manifests.flatMap(dependenciesOf)) {
    const other = found.get(name);
    if (other !== undefined && other !== version) {
      throw new HarnessError(
        `${name} is asked for at ${other} and at ${version}. ` +
          'The built package installs one version.',
      );
    }
    found.set(name, version);
  }
  return Object.fromEntries(
    [...found].sort(([left], [right]) => left.localeCompare(right)),
  );
}

/**
 * The manifest of the built package: the name, the version and the Node
 * of the root manifest, and what every workspace needs when it runs. The
 * client and the service are one application, so they are installed as
 * one package with one list of dependencies.
 */
export function packageManifestOf(root: string): PackageManifest {
  const own = readJsonRecord(join(root, MANIFEST));
  const workspaces = stringListAt(own, 'workspaces').map((folder) =>
    readJsonRecord(join(root, folder, MANIFEST)),
  );
  return {
    name: stringAt(own, 'name'),
    version: stringAt(own, 'version'),
    type: 'module',
    engines: recordAt(own, 'engines'),
    dependencies: sharedDependencies(workspaces),
  };
}
