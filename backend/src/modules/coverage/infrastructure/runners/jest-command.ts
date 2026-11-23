import { join } from 'node:path';

import type { TestRunRequest } from '#coverage/application/ports/test-runner.port';
import {
  JEST_REPORTER_FILE,
  JEST_REPORTER_SOURCE,
} from '#coverage/infrastructure/runners/jest-results-reporter';
import {
  exactGlob,
  REPORT_FOLDER,
  type RunnerCommand,
} from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';

/** Started by its path, so no script of the repository can swap it. */
const JEST = 'node_modules/jest/bin/jest.js';

/** Jest reads its configuration from `package.json` by itself. */
const MANIFEST = 'package.json';

function configArguments(request: TestRunRequest): string[] {
  const file = request.project.configFile?.value;
  return file === undefined || file === MANIFEST ? [] : ['--config', file];
}

function coverageArguments(request: TestRunRequest): string[] {
  if (request.coverageFiles === null) {
    return ['--coverage=false'];
  }
  return [
    '--coverage',
    `--coverageProvider=${request.parameters.coverageProvider}`,
    '--coverageReporters=json',
    `--coverageDirectory=${REPORT_FOLDER}`,
    ...request.coverageFiles.map(
      (path) => `--collectCoverageFrom=${exactGlob(path)}`,
    ),
  ];
}

/**
 * A reporter named on the command line replaces those of the
 * configuration, so the usual one is named beside the one of the service.
 * That one is named by an absolute path: Jest looks for a relative one
 * from its root folder, which a repository may move.
 */
function resultsArguments(request: TestRunRequest): string[] {
  const reporter = join(request.workingCopyPath, JEST_REPORTER_FILE);
  return ['--reporters=default', `--reporters=${reporter}`];
}

function testArguments(request: TestRunRequest): string[] {
  const paths = request.testFiles.map((path) => path.value);
  return paths.length === 0 ? [] : ['--runTestsByPath', ...paths];
}

/**
 * Jest with the file list: without `--collectCoverageFrom` it leaves out
 * every file that no test imports. Test files are named as paths, never
 * as patterns.
 */
export const JEST_COMMAND: RunnerCommand = {
  testRunner: 'jest',
  files: { [JEST_REPORTER_FILE]: JEST_REPORTER_SOURCE },
  commandFor: (request) => [
    'node',
    JEST,
    '--ci',
    ...configArguments(request),
    ...coverageArguments(request),
    ...resultsArguments(request),
    ...testArguments(request),
  ],
};
