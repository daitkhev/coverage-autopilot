import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import type {
  ProjectDetection,
  ProjectDetector,
  UnsupportedProject,
} from '#coverage/application/ports/project-detector.port';
import {
  DetectedProject,
  type TestRunnerName,
} from '#coverage/domain/value-objects/detected-project.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import {
  packageLockSchema,
  type PackageManifest,
  packageManifestSchema,
} from '#coverage/infrastructure/detection/package-manifest.schema';
import {
  chooseRunner,
  coverageProviderOf,
  declaredPackages,
  type Found,
  unsupported,
} from '#coverage/infrastructure/detection/runner-choice';
import {
  FILE_LIST_RULE,
  listSourceFiles,
} from '#coverage/infrastructure/detection/source-file-list';
import { readCopyFile } from '#infrastructure/files/copy-file';
import { FilePath } from '#kernel/primitives/file-path';

const MANIFEST = 'package.json';

/** npm 7 and later write either of them, with every package it installs. */
const NPM_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json'];

/** The `packageManager` field of Corepack, such as `npm@10.9.2`. */
const NPM = /^npm(?:@|$)/u;

const WORKSPACE_FILES = ['pnpm-workspace.yaml', 'lerna.json'];

const OTHER_LOCKFILES = [
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
];

/**
 * The cache of an install, inside the copy and so on the disk of the host
 * and gone with the copy. The home of a command is the folder in memory,
 * which the cache of a large project filled. Under `node_modules` no
 * runner, no compiler and no mutation tool looks into it.
 */
const INSTALL_CACHE = 'node_modules/.cache/coverage-autopilot/install';

/**
 * The lockfile decides every version, and no script of a package runs
 * while the network is open: the code of the repository runs only later,
 * in a sandbox with no network.
 */
const INSTALL_COMMAND = [
  'npm',
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--cache',
  INSTALL_CACHE,
];

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

const CONFIG_FILES: Readonly<Record<TestRunnerName, readonly string[]>> = {
  jest: [...CONFIG_EXTENSIONS, 'json'].map(
    (extension) => `jest.config.${extension}`,
  ),
  vitest: ['vitest.config', 'vite.config'].flatMap((name) =>
    CONFIG_EXTENSIONS.map((extension) => `${name}.${extension}`),
  ),
};

/** `null` for a file that is not JSON of this shape, or is not read at all. */
function readJson<Schema extends z.ZodType>(
  file: { readonly root: string; readonly path: string },
  schema: Schema,
): z.infer<Schema> | null {
  const read = readCopyFile(file.root, file.path);
  if (read.outcome !== 'read') {
    return null;
  }
  try {
    return schema.parse(JSON.parse(read.text));
  } catch {
    return null;
  }
}

function readManifest(
  root: string,
): Found<PackageManifest> | UnsupportedProject {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) {
    return unsupported(
      'no_package_manifest',
      'The repository has no package.json at its root.',
    );
  }
  const manifest = readJson({ root, path }, packageManifestSchema);
  return manifest === null
    ? unsupported(
        'invalid_package_manifest',
        'package.json at the root is not a JSON object.',
      )
    : { outcome: 'found', value: manifest };
}

function layoutRefusal(
  root: string,
  manifest: PackageManifest,
): UnsupportedProject | null {
  const workspaceFile = WORKSPACE_FILES.find((name) =>
    existsSync(join(root, name)),
  );
  if (manifest.workspaces !== undefined || workspaceFile !== undefined) {
    return unsupported(
      'monorepo',
      `The repository holds more than one package (${workspaceFile ?? 'workspaces in package.json'}).`,
    );
  }
  const manager = manifest.packageManager ?? 'npm';
  const otherLockfile = OTHER_LOCKFILES.find((name) =>
    existsSync(join(root, name)),
  );
  if (!NPM.test(manager) || otherLockfile !== undefined) {
    return unsupported(
      'unsupported_package_manager',
      `The repository is installed with ${otherLockfile ?? manager}, and only npm is supported.`,
    );
  }
  return null;
}

function lockedVersion(
  root: string,
  runner: TestRunnerName,
): Found<string> | UnsupportedProject {
  const lockfile = NPM_LOCKFILES.map((name) => join(root, name)).find((path) =>
    existsSync(path),
  );
  const lock =
    lockfile === undefined
      ? null
      : readJson({ root, path: lockfile }, packageLockSchema);
  const version = lock?.packages?.[`node_modules/${runner}`]?.version;
  return version === undefined
    ? unsupported(
        'no_lockfile',
        `No lockfile of npm locks the version of ${runner}.`,
      )
    : { outcome: 'found', value: version };
}

function configFileOf(
  root: string,
  runner: TestRunnerName,
  manifest: PackageManifest,
): FilePath | null {
  const file = CONFIG_FILES[runner].find((name) =>
    existsSync(join(root, name)),
  );
  const inManifest = runner === 'jest' && manifest.jest !== undefined;
  const name = file ?? (inManifest ? MANIFEST : undefined);
  return name === undefined ? null : FilePath.create(name);
}

function supportedProject(
  root: string,
  manifest: PackageManifest,
  runner: TestRunnerName,
): ProjectDetection {
  const version = lockedVersion(root, runner);
  const provider = coverageProviderOf(runner, declaredPackages(manifest));
  if (version.outcome === 'unsupported') {
    return version;
  }
  if (provider.outcome === 'unsupported') {
    return provider;
  }
  return {
    outcome: 'supported',
    project: DetectedProject.create({
      testRunner: runner,
      testRunnerVersion: version.value,
      packageManager: 'npm',
      configFile: configFileOf(root, runner, manifest),
    }),
    parameters: ScanParameters.create({
      testRunner: runner,
      testRunnerVersion: version.value,
      coverageProvider: provider.value,
      fileListRule: FILE_LIST_RULE,
    }),
    installCommand: INSTALL_COMMAND,
    eligibleFiles: listSourceFiles(root),
  };
}

/**
 * Detects a project of one npm package tested with Jest or Vitest. It
 * reads files and runs nothing. Every other kind of repository is
 * reported as a value with the reason.
 */
@Injectable()
export class NodeProjectDetector implements ProjectDetector {
  public async detect(workingCopyPath: string): Promise<ProjectDetection> {
    return Promise.resolve(this.detectIn(workingCopyPath));
  }

  private detectIn(root: string): ProjectDetection {
    const manifest = readManifest(root);
    if (manifest.outcome === 'unsupported') {
      return manifest;
    }
    const refusal = layoutRefusal(root, manifest.value);
    if (refusal !== null) {
      return refusal;
    }
    const runner = chooseRunner(manifest.value);
    return runner.outcome === 'unsupported'
      ? runner
      : supportedProject(root, manifest.value, runner.value);
  }
}
