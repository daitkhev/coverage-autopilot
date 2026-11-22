import { join } from 'node:path';

import type { FilePath } from '#kernel/primitives/file-path';
import type {
  MutationRunRequest,
  MutationToolRequest,
} from '#verification/application/ports/mutation-runner.port';
import type { MutationSettings } from '#verification/infrastructure/mutation/mutation-settings';

/**
 * The one folder of a run in the working copy, and the temporary folder of
 * StrykerJS as well: the tool copies none of its files into its sandbox,
 * and its search for `node_modules` does not walk into it.
 */
export const MUTATION_FOLDER = '.coverage-autopilot-mutation';

export const CONFIG_FILE = `${MUTATION_FOLDER}/stryker.config.json`;

export const REPORT_FILE = `${MUTATION_FOLDER}/report.json`;

/** Where the incremental mode of StrykerJS reads and writes its cache. */
export const CACHE_FILE = `${MUTATION_FOLDER}/incremental.json`;

/**
 * The tool has a folder of its own beside the packages of the project. An
 * install among them would reshape a tree that pnpm or yarn laid out, and
 * npm would fetch the packages of the project again without the lockfile.
 * Under `node_modules` no patch can take it, and the tool copies nothing
 * from there into its sandbox.
 */
const TOOL_FOLDER = 'node_modules/.cache/coverage-autopilot/mutation';

/** Started by its path, so no script of the repository can swap it. */
const STRYKER = `${TOOL_FOLDER}/node_modules/@stryker-mutator/core/bin/stryker.js`;

/**
 * pnpm links into `node_modules` only the packages the manifest names, and
 * every other package into this folder. The runner of Jest looks for the
 * environment of the tests from the sandbox of the tool, which links the
 * `node_modules` of the copy, so it finds it only through `NODE_PATH`. A
 * copy that no pnpm installed has no such folder, and Node skips it.
 */
const PNPM_HOISTED = 'node_modules/.pnpm/node_modules';

/** Characters minimatch reads as a pattern, each made a class of itself. */
const PATTERN_CHARACTERS = /[*?[\]()]/gu;

/**
 * A brace is expanded before a class is read, so it is matched by any one
 * character instead.
 */
const BRACES = /[{}]/gu;

/**
 * The target as a pattern that matches that file, such as `[id].ts`.
 * StrykerJS turns every backslash into a slash, so no character can be
 * escaped with one, and it reads a pattern that starts with `!` as an
 * exclusion, so the pattern starts with `./`.
 */
export function mutatePatternOf(path: FilePath): string {
  const pattern = path.value
    .replace(PATTERN_CHARACTERS, '[$&]')
    .replace(BRACES, '?');
  return `./${pattern}`;
}

/**
 * The tool and its runner plugin at the version of the settings, in the
 * folder of the tool, with the cache of npm there as well. It runs while
 * the network is open, so no script of a package runs. No peer is
 * installed: the runner plugin then loads the test runner of the project.
 */
export function installCommandOf(
  request: MutationToolRequest,
  settings: MutationSettings,
): string[] {
  const version = settings.toolVersion;
  return [
    'npm',
    'install',
    ...['--prefix', TOOL_FOLDER],
    '--no-save',
    '--no-package-lock',
    '--ignore-scripts',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
    ...['--cache', `${TOOL_FOLDER}/cache`],
    `@stryker-mutator/core@${version}`,
    `@stryker-mutator/${request.testRunner}-runner@${version}`,
  ];
}

/** StrykerJS with the configuration of the service and no other. */
export const RUN_COMMAND: readonly string[] = [
  'node',
  STRYKER,
  'run',
  CONFIG_FILE,
];

/** The variables of a run besides those of the settings. */
export function runVariablesOf(
  workingCopyPath: string,
): Readonly<Record<string, string>> {
  return { NODE_PATH: join(workingCopyPath, PNPM_HOISTED) };
}

/**
 * Left alone, each runner starts only the tests it finds related to the
 * mutated file. No test imports a file nobody tested yet, so the tool ran
 * none and stopped, and such a file is what an improvement is asked for
 * most. Every test runs once instead, and `perTest` still ties a mutant
 * to the tests that reach it.
 */
const EVERY_TEST: Readonly<
  Record<MutationRunRequest['testRunner'], Readonly<Record<string, object>>>
> = {
  jest: { jest: { enableFindRelatedTests: false } },
  vitest: { vitest: { related: false } },
};

/**
 * The tool copies every file of the copy into its sandbox, and yarn 2 and
 * later keep there an archive of each package they installed.
 */
const IGNORED = ['/.yarn/cache'];

/**
 * The configuration of one run. Only the target is mutated. Every test
 * that kills a mutant is listed, the tests are tied to the mutants they
 * run, and the number of test runners is the one of the settings. The
 * project's own configuration of StrykerJS is never read.
 */
export function strykerConfigurationOf(
  request: MutationRunRequest,
  settings: MutationSettings,
): string {
  const configuration = {
    testRunner: request.testRunner,
    ...EVERY_TEST[request.testRunner],
    mutate: [mutatePatternOf(request.targetFile)],
    coverageAnalysis: 'perTest',
    disableBail: true,
    concurrency: settings.concurrency,
    timeoutFactor: settings.mutantTimeoutFactor,
    timeoutMS: settings.mutantTimeoutMs,
    reporters: ['json'],
    jsonReporter: { fileName: REPORT_FILE },
    incremental: true,
    incrementalFile: CACHE_FILE,
    tempDirName: MUTATION_FOLDER,
    ignorePatterns: IGNORED,
    allowConsoleColors: false,
  };
  return JSON.stringify(configuration);
}
