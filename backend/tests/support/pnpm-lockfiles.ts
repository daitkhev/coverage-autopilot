/** A key of YAML as pnpm writes it: quoted when it starts with `@`. */
function keyOf(name: string): string {
  return name.startsWith('@') ? `'${name}'` : name;
}

/**
 * A `pnpm-lock.yaml` of the format pnpm 9 to 11 write, with each package
 * a dev dependency of the project at its version, its peers after it as
 * pnpm adds them, and the same package once more as a dependency of
 * another, where its version is no `version` of its own.
 */
export function pnpmLockfileOf(
  versions: Readonly<Record<string, string>>,
): string {
  const importers = Object.entries(versions).map(
    ([name, version]) =>
      `      ${keyOf(name)}:\n` +
      `        specifier: ^${version}\n` +
      `        version: ${version}(@types/node@24.10.1)\n`,
  );
  const snapshots = Object.keys(versions).map(
    (name) => `      ${keyOf(name)}: 0.0.1\n`,
  );
  return [
    "lockfileVersion: '9.0'\n",
    'settings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n',
    `importers:\n\n  .:\n    devDependencies:\n${importers.join('')}`,
    'packages:\n\n  chalk@4.1.2:\n    resolution: {integrity: sha512-oKnb}\n' +
      "    engines: {node: '>=10'}\n",
    `snapshots:\n\n  chalk@4.1.2:\n    dependencies:\n${snapshots.join('')}`,
  ].join('\n');
}

/** The same project as pnpm 8 writes it: no importers, a `/` before a key. */
export const PNPM_8_LOCKFILE = [
  "lockfileVersion: '6.0'\n",
  'devDependencies:\n  jest:\n    specifier: ^30.5.2\n    version: 30.5.2(@types/node@24.10.1)\n',
  'packages:\n\n  /jest@30.5.2:\n    resolution: {integrity: sha512-oKnb}\n' +
    '    dependencies:\n      jest-cli: 30.5.2\n',
].join('\n');

/** The same project as pnpm 7 writes it: a version and its peers in one. */
export const PNPM_7_LOCKFILE = [
  'lockfileVersion: 5.4\n',
  'specifiers:\n  jest: ^30.5.2\n',
  'devDependencies:\n  jest: 30.5.2_@types+node@24.10.1\n',
  'packages:\n\n  /jest/30.5.2_@types+node@24.10.1:\n    dev: true\n',
].join('\n');

/**
 * The lockfile of pnpm 12: first a document of the programs of pnpm
 * itself, then the document of the project.
 */
export function pnpm12LockfileOf(
  versions: Readonly<Record<string, string>>,
): string {
  return (
    "---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n" +
    '    configDependencies: {}\n    packageManagerDependencies:\n' +
    '      pnpm:\n        specifier: 12.21.0\n        version: 12.21.0\n\n' +
    `---\n${pnpmLockfileOf(versions)}`
  );
}
