import type { TestRunRequest } from '#coverage/application/ports/test-runner.port';
import {
  exactGlob,
  REPORT_FOLDER,
  type RunnerCommand,
} from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';

/** Started by its path, so no script of the repository can swap it. */
const VITEST = 'node_modules/vitest/vitest.mjs';

/**
 * Vitest takes the configuration of a folder above when the project has
 * none of its own, so a configuration that was found is always named.
 */
function configArguments(request: TestRunRequest): string[] {
  const file = request.project.configFile?.value;
  return file === undefined ? [] : ['--config', file];
}

function coverageArguments(request: TestRunRequest): string[] {
  if (request.coverageFiles === null) {
    return ['--coverage.enabled=false'];
  }
  return [
    '--coverage.enabled=true',
    `--coverage.provider=${request.parameters.coverageProvider}`,
    '--coverage.reporter=json',
    `--coverage.reportsDirectory=${REPORT_FOLDER}`,
    ...request.coverageFiles.map(
      (path) => `--coverage.include=${exactGlob(path)}`,
    ),
  ];
}

/**
 * Vitest with the file list: without `--coverage.include` it leaves out
 * every file that no test imports.
 */
export const VITEST_COMMAND: RunnerCommand = {
  testRunner: 'vitest',
  commandFor: (request) => [
    'node',
    VITEST,
    'run',
    ...configArguments(request),
    ...coverageArguments(request),
    ...request.testFiles.map((path) => path.value),
  ],
};
