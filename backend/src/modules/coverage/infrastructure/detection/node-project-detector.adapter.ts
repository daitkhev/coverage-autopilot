import { Injectable } from '@nestjs/common';

import type {
  InstallMode,
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
  hasFile,
  readJson,
  readText,
} from '#coverage/infrastructure/detection/copy-text';
import { topKeysOf } from '#coverage/infrastructure/detection/indented-keys';
import type {
  CopyToInstall,
  ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import { chooseManager } from '#coverage/infrastructure/detection/package-managers';
import {
  type PackageManifest,
  packageManifestSchema,
} from '#coverage/infrastructure/detection/package-manifest.schema';
import { PNPM_WORKSPACE } from '#coverage/infrastructure/detection/pnpm-manager';
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
import { FilePath } from '#kernel/primitives/file-path';

const MANIFEST = 'package.json';

const LERNA = 'lerna.json';

/**
 * A pnpm workspace lists its packages under this key. A file without it
 * holds the settings of pnpm for a project of one package.
 */
const WORKSPACE_PACKAGES = 'packages';

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

const CONFIG_FILES: Readonly<Record<TestRunnerName, readonly string[]>> = {
  jest: [...CONFIG_EXTENSIONS, 'json'].map(
    (extension) => `jest.config.${extension}`,
  ),
  vitest: ['vitest.config', 'vite.config'].flatMap((name) =>
    CONFIG_EXTENSIONS.map((extension) => `${name}.${extension}`),
  ),
};

function readManifest(
  root: string,
): Found<PackageManifest> | UnsupportedProject {
  if (!hasFile(root, MANIFEST)) {
    return unsupported(
      'no_package_manifest',
      'The repository has no package.json at its root.',
    );
  }
  const manifest = readJson(root, MANIFEST, packageManifestSchema);
  return manifest === null
    ? unsupported(
        'invalid_package_manifest',
        'package.json at the root is not a JSON object.',
      )
    : { outcome: 'found', value: manifest };
}

/** A workspace file that cannot be read is taken for a workspace. */
function pnpmWorkspaceOf(root: string): boolean {
  const text = readText(root, PNPM_WORKSPACE);
  return text === null
    ? hasFile(root, PNPM_WORKSPACE)
    : topKeysOf(text).has(WORKSPACE_PACKAGES);
}

function monorepoRefusal(
  root: string,
  manifest: PackageManifest,
): UnsupportedProject | null {
  const workspace = [
    ...(manifest.workspaces === undefined
      ? []
      : ['workspaces in package.json']),
    ...(pnpmWorkspaceOf(root) ? [PNPM_WORKSPACE] : []),
    ...(hasFile(root, LERNA) ? [LERNA] : []),
  ][0];
  return workspace === undefined
    ? null
    : unsupported(
        'monorepo',
        `The repository holds more than one package (${workspace}).`,
      );
}

/** The runner of the tests and the manager of the packages, as chosen. */
interface Tools {
  readonly runner: TestRunnerName;
  readonly manager: ManagerChoice;
}

function lockedVersionOf(
  root: string,
  manifest: PackageManifest,
  { runner, manager }: Tools,
): Found<string> | UnsupportedProject {
  const lockfile = readText(root, manager.lockfile);
  const range =
    manifest.devDependencies?.[runner] ?? manifest.dependencies?.[runner] ?? '';
  const version =
    lockfile === null
      ? null
      : manager.lockedVersion(lockfile, { name: runner, range });
  return version === null
    ? unsupported(
        'no_lockfile',
        `${manager.lockfile} locks no version of ${runner}.`,
      )
    : { outcome: 'found', value: version };
}

function configFileOf(
  root: string,
  runner: TestRunnerName,
  manifest: PackageManifest,
): FilePath | null {
  const file = CONFIG_FILES[runner].find((name) => hasFile(root, name));
  const inManifest = runner === 'jest' && manifest.jest !== undefined;
  const name = file ?? (inManifest ? MANIFEST : undefined);
  return name === undefined ? null : FilePath.create(name);
}

function supportedProject(
  root: string,
  manifest: PackageManifest,
  tools: Tools,
): ProjectDetection {
  const { runner, manager } = tools;
  const version = lockedVersionOf(root, manifest, tools);
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
      packageManager: manager.name,
      configFile: configFileOf(root, runner, manifest),
    }),
    parameters: ScanParameters.create({
      testRunner: runner,
      testRunnerVersion: version.value,
      coverageProvider: provider.value,
      fileListRule: FILE_LIST_RULE,
    }),
    install: manager.install,
    eligibleFiles: listSourceFiles(root),
  };
}

/**
 * Detects a project of one package, installed with npm, pnpm or yarn and
 * tested with Jest or Vitest. It reads files and runs nothing. Every other
 * kind of repository is reported as a value with the reason.
 */
@Injectable()
export class NodeProjectDetector implements ProjectDetector {
  public async detect(
    workingCopyPath: string,
    mode: InstallMode,
  ): Promise<ProjectDetection> {
    return Promise.resolve(this.detectIn({ root: workingCopyPath, mode }));
  }

  private detectIn(copy: CopyToInstall): ProjectDetection {
    const { root } = copy;
    const manifest = readManifest(root);
    if (manifest.outcome === 'unsupported') {
      return manifest;
    }
    const refusal = monorepoRefusal(root, manifest.value);
    if (refusal !== null) {
      return refusal;
    }
    const manager = chooseManager(copy, manifest.value);
    if (manager.outcome === 'unsupported') {
      return manager;
    }
    const runner = chooseRunner(manifest.value);
    return runner.outcome === 'unsupported'
      ? runner
      : supportedProject(root, manifest.value, {
          runner: runner.value,
          manager: manager.value,
        });
  }
}
