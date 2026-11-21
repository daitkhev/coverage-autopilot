import type { TestRunRequest } from '#coverage/application/ports/test-runner.port';
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
  commandFor: (request) => [
    'node',
    JEST,
    '--ci',
    ...configArguments(request),
    ...coverageArguments(request),
    ...testArguments(request),
  ],
};
