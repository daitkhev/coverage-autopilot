import { join } from 'node:path';

import { rolldown } from 'rolldown';

import type { Host } from '#harness/gate/host';

/**
 * What the build reads and writes, from the root of the tree. The file
 * is beside the migrations as the entry file is, so the entry finds them
 * by the same step from its own place, built or not.
 */
export const SERVICE_BUILD = {
  entry: 'backend/src/main.ts',
  settings: 'backend/tsconfig.json',
  file: 'backend/dist/main.js',
} as const;

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

/**
 * Builds the service into one file plain Node runs. A warning of the
 * bundler fails the build like an error: an import it could not follow
 * would otherwise fail only when the built service reaches it.
 */
export async function runBuild(host: Host): Promise<number> {
  const warnings: string[] = [];
  try {
    await write(host.root, warnings);
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
  host.print(`build: ${SERVICE_BUILD.file} was written.`);
  return 0;
}
