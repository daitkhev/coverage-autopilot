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
 * A path as a pattern that matches that file, such as `[id].ts`.
 * StrykerJS turns every backslash into a slash, so no character can be
 * escaped with one.
 */
function patternOf(path: FilePath): string {
  return path.value.replace(PATTERN_CHARACTERS, '[$&]').replace(BRACES, '?');
}

/**
 * The target as a pattern of itself. StrykerJS reads a pattern that
 * starts with `!` as an exclusion, so the pattern starts with `./`.
 */
export function mutatePatternOf(path: FilePath): string {
  return `./${patternOf(path)}`;
}

/**
 * A file the tool leaves out of its sandbox, so no runner finds it. The
 * tool matches each path from the root of the copy with a `/` before it.
 */
export function ignorePatternOf(path: FilePath): string {
  return `/${patternOf(path)}`;
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

/** What every run of the tool shares, whatever runs the tests. */
function commonPartOf(
  request: MutationRunRequest,
  settings: MutationSettings,
): Readonly<Record<string, unknown>> {
  return {
    mutate: [mutatePatternOf(request.targetFile)],
    concurrency: settings.concurrency,
    timeoutFactor: settings.mutantTimeoutFactor,
    timeoutMS: settings.mutantTimeoutMs,
    reporters: ['json'],
    jsonReporter: { fileName: REPORT_FILE },
    tempDirName: MUTATION_FOLDER,
    ignorePatterns: [
      ...IGNORED,
      ...request.leftOutTestFiles.map(ignorePatternOf),
    ],
    allowConsoleColors: false,
  };
}

/**
 * The configuration of one run. Only the target is mutated. Every test
 * that kills a mutant is listed, the tests are tied to the mutants they
 * run, and the number of test runners is the one of the settings. The
 * project's own configuration of StrykerJS is never read. When the files
 * left out held every test, the tool ends at once with no report.
 */
export function strykerConfigurationOf(
  request: MutationRunRequest,
  settings: MutationSettings,
): string {
  const configuration = {
    testRunner: request.testRunner,
    ...EVERY_TEST[request.testRunner],
    coverageAnalysis: 'perTest',
    disableBail: true,
    incremental: true,
    incrementalFile: CACHE_FILE,
    allowEmpty: true,
    ...commonPartOf(request, settings),
  };
  return JSON.stringify(configuration);
}

/**
 * A run that only lists the mutants, for a commit left with no test: the
 * runner is a command that passes, so no mutant is detected. Nothing of
 * it is cached, since its results are not those of any test.
 */
export function listingConfigurationOf(
  request: MutationRunRequest,
  settings: MutationSettings,
): string {
  const configuration = {
    testRunner: 'command',
    commandRunner: { command: 'exit 0' },
    coverageAnalysis: 'off',
    incremental: false,
    ...commonPartOf(request, settings),
  };
  return JSON.stringify(configuration);
}
