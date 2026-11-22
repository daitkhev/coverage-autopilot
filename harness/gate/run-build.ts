import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { rolldown } from 'rolldown';

import type { Host } from '#harness/gate/host';
import { packageManifestOf } from '#harness/gate/package-manifest';

/**
 * The package the build writes, from the root of the tree: what a person
 * installs. A program is in `bin/`, beside the migrations and the
 * manifest one step up, as the entry file of the service is in its
 * workspace, so it finds both by the same step from its own place, built
 * or not.
 */
export const PACKAGE_BUILD = {
  folder: 'dist',
  manifest: 'dist/package.json',
  migrations: { from: 'backend/migrations', to: 'dist/migrations' },
} as const;

/** What the build of the service reads and writes. */
export const SERVICE_BUILD = {
  entry: 'backend/src/main.ts',
  settings: 'backend/tsconfig.json',
  file: 'dist/bin/service.js',
} as const;

const JSON_INDENT = 2;

/**
 * The code of this repository: a path, an alias of a workspace, the
 * contracts, and the helpers the bundler itself puts in for decorators.
 */
const OWN_CODE = /^(?:[./#]|@coverage-autopilot\/|@oxc-project\/runtime\/)/;

/**
 * Whether an import stays an import in the built file. A package of npm
 * and a module of Node do: they come with the install of the package.
 * Only the code of this repository is put into the file.
 */
export function staysImport(id: string): boolean {
  return !OWN_CODE.test(id);
}

async function write(root: string, warnings: string[]): Promise<void> {
  const bundle = await rolldown({
    input: join(root, SERVICE_BUILD.entry),
    platform: 'node',
    tsconfig: join(root, SERVICE_BUILD.settings),
    external: staysImport,
    onLog: (level, log) => {
      if (level === 'warn') {
        warnings.push(log.message);
      }
    },
  });
  try {
    await bundle.write({ file: join(root, SERVICE_BUILD.file), format: 'esm' });
  } finally {
    await bundle.close();
  }
}

/** The migrations and the manifest, which the built service reads. */
function writeBeside(root: string): void {
  const { migrations, manifest } = PACKAGE_BUILD;
  cpSync(join(root, migrations.from), join(root, migrations.to), {
    recursive: true,
  });
  const text = JSON.stringify(packageManifestOf(root), null, JSON_INDENT);
  mkdirSync(dirname(join(root, manifest)), { recursive: true });
  writeFileSync(join(root, manifest), `${text}\n`);
}

/**
 * Builds the package a person installs: the service as one file plain
 * Node runs, its migrations and the manifest. The folder is emptied
 * first, so nothing of an earlier build is taken for a part of this one.
 * A warning of the bundler fails the build like an error: an import it
 * could not follow would otherwise fail only when the built service
 * reaches it.
 */
export async function runBuild(host: Host): Promise<number> {
  const warnings: string[] = [];
  try {
    rmSync(join(host.root, PACKAGE_BUILD.folder), {
      recursive: true,
      force: true,
    });
    await write(host.root, warnings);
    writeBeside(host.root);
  } catch (error) {
    host.print(
      `build: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  for (const warning of warnings) {
    host.print(`build: ${warning}`);
  }
  if (warnings.length > 0) {
    return 1;
  }
  host.print(`build: ${PACKAGE_BUILD.folder} was written.`);
  return 0;
}
