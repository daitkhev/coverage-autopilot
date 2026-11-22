import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { rolldown } from 'rolldown';

import type { Host } from '#harness/gate/host';
import { packageManifestOf } from '#harness/gate/package-manifest';

/**
 * The package the build writes, from the root of the tree: what a person
 * installs. A program is in `bin/`, and what the service reads beside
 * its code is at the path it has from the entry file of the service in
 * its workspace: the manifest one step up, the migrations in the folder
 * of the code that applies them, and the file of an image in the folder
 * of the code that builds it. So the service finds each by the same step
 * from its own place, built or not.
 */
export const PACKAGE_BUILD = {
  folder: 'dist',
  manifest: 'dist/package.json',
  migrations: {
    from: 'backend/src/shared/infrastructure/database/migrations',
    to: 'dist/bin/shared/infrastructure/database/migrations',
  },
  /** What the image of the generator is built from. */
  generatorImage: {
    from: 'backend/src/shared/infrastructure/sandbox/generator.Dockerfile',
    to: 'dist/bin/shared/infrastructure/sandbox/generator.Dockerfile',
  },
} as const;

/** What the build of one program reads and writes. */
interface ProgramBuild {
  readonly entry: string;
  readonly settings: string;
  readonly file: string;
  /** The first line of a file a person starts by its name. */
  readonly banner?: string;
}

/** The service, which the client starts with Node. */
export const SERVICE_BUILD = {
  entry: 'backend/src/main.ts',
  settings: 'backend/tsconfig.json',
  file: 'dist/bin/service.js',
} as const;

/**
 * The client, the program of the package: a person starts it by the name
 * of the package, so its file names what runs it and may be run.
 */
export const CLIENT_BUILD = {
  entry: 'frontend/src/main.tsx',
  settings: 'frontend/tsconfig.json',
  file: 'dist/bin/client.js',
  banner: '#!/usr/bin/env node',
} as const;

const PROGRAMS: readonly ProgramBuild[] = [SERVICE_BUILD, CLIENT_BUILD];

/** Read and run by everyone, written by its owner. */
const PROGRAM_MODE = 0o755;

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

async function write(
  root: string,
  program: ProgramBuild,
  warnings: string[],
): Promise<void> {
  const bundle = await rolldown({
    input: join(root, program.entry),
    platform: 'node',
    tsconfig: join(root, program.settings),
    external: staysImport,
    onLog: (level, log) => {
      if (level === 'warn') {
        warnings.push(log.message);
      }
    },
  });
  const file = join(root, program.file);
  try {
    await bundle.write({
      file,
      format: 'esm',
      ...(program.banner === undefined ? {} : { banner: program.banner }),
    });
  } finally {
    await bundle.close();
  }
  if (program.banner !== undefined) {
    chmodSync(file, PROGRAM_MODE);
  }
}

/**
 * The migrations, the file of the image and the manifest, which the built
 * service reads.
 */
function writeBeside(root: string): void {
  const { migrations, generatorImage, manifest } = PACKAGE_BUILD;
  cpSync(join(root, migrations.from), join(root, migrations.to), {
    recursive: true,
  });
  cpSync(join(root, generatorImage.from), join(root, generatorImage.to));
  const program = relative(PACKAGE_BUILD.folder, CLIENT_BUILD.file);
  const text = JSON.stringify(
    packageManifestOf(root, program),
    null,
    JSON_INDENT,
  );
  mkdirSync(dirname(join(root, manifest)), { recursive: true });
  writeFileSync(join(root, manifest), `${text}\n`);
}

/**
 * Builds the package a person installs: the client and the service, each
 * as one file plain Node runs, the migrations, the file of the image of
 * the generator and the manifest. The folder is emptied first, so nothing
 * of an earlier build is taken for a part of this one.
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
    for (const program of PROGRAMS) {
      await write(host.root, program, warnings);
    }
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
