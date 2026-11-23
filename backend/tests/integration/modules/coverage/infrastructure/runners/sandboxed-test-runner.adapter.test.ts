import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestRunRequest } from '#coverage/application/ports/test-runner.port';
import {
  DetectedProject,
  type TestRunnerName,
} from '#coverage/domain/value-objects/detected-project.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { JEST_COMMAND } from '#coverage/infrastructure/runners/jest-command';
import {
  type RunnerCommand,
  SandboxedTestRunner,
} from '#coverage/infrastructure/runners/sandboxed-test-runner.adapter';
import { VITEST_COMMAND } from '#coverage/infrastructure/runners/vitest-command';
import { FilePath } from '#kernel/primitives/file-path';
import type { SandboxCommandResult } from '#ports/sandbox.port';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import {
  COVERAGE_TEST_SETTINGS,
  RecordingSandbox,
} from '#tests/support/recording-sandbox';

const REPORT_FOLDER = 'node_modules/.cache/coverage-autopilot/coverage';
const RESULTS_FILE = 'node_modules/.coverage-autopilot-test-results.json';

const REPORTER_FILE = 'node_modules/.coverage-autopilot-test-reporter.cjs';

function resultsFile(): string {
  return join(folder.root, RESULTS_FILE);
}

function reporterFile(): string {
  return join(folder.root, REPORTER_FILE);
}

const COMMANDS: Readonly<Record<TestRunnerName, RunnerCommand>> = {
  jest: JEST_COMMAND,
  vitest: VITEST_COMMAND,
};

let folder: ProjectFolder;
let sandbox: RecordingSandbox;

interface RunSpec {
  readonly runner: TestRunnerName;
  readonly configFile?: string;
  readonly testFiles?: readonly string[];
  readonly withCoverage?: boolean;
}

function requestOf(spec: RunSpec): TestRunRequest {
  const version = spec.runner === 'jest' ? '30.5.2' : '4.1.12';
  return {
    workingCopyPath: folder.root,
    project: DetectedProject.create({
      testRunner: spec.runner,
      testRunnerVersion: version,
      packageManager: 'npm',
      configFile:
        spec.configFile === undefined ? null : FilePath.create(spec.configFile),
    }),
    parameters: ScanParameters.create({
      testRunner: spec.runner,
      testRunnerVersion: version,
      coverageProvider: spec.runner === 'jest' ? 'babel' : 'v8',
      fileListRule: 'typescript-sources-v1',
    }),
    testFiles: (spec.testFiles ?? []).map((path) => FilePath.create(path)),
    coverageFiles:
      spec.withCoverage === false
        ? null
        : [FilePath.create('src/used.ts'), FilePath.create('src/[id].ts')],
  };
}

async function run(
  spec: RunSpec,
  signal = new AbortController().signal,
): Promise<string | null> {
  const runner = new SandboxedTestRunner(
    COMMANDS[spec.runner],
    sandbox,
    COVERAGE_TEST_SETTINGS,
  );
  const output = await runner.run(requestOf(spec), signal);
  return output.reportPath;
}

function commandsRun(): (readonly string[])[] {
  return sandbox.requests.map((request) => request.command);
}

beforeEach(() => {
  folder = createProjectFolder();
  sandbox = new RecordingSandbox();
});

afterEach(() => {
  folder.remove();
});

describe('SandboxedTestRunner', () => {
  describe('run', () => {
    it('should run with no network, the listed variables and the limit', async () => {
      await run({ runner: 'jest' });

      expect(sandbox.requests).toMatchObject([
        {
          workingCopyPath: folder.root,
          environment: COVERAGE_TEST_SETTINGS.commandEnvironment,
          network: 'none',
          timeoutMs: COVERAGE_TEST_SETTINGS.testRunTimeoutMs,
        },
      ]);
    });

    it('should say where the report is when it measures', async () => {
      const report = join(folder.root, REPORT_FOLDER, 'coverage-final.json');

      await expect(run({ runner: 'vitest' })).resolves.toBe(report);
      await expect(run({ runner: 'jest', withCoverage: false })).resolves.toBe(
        null,
      );
    });

    it('should say where the report of the tests is, with coverage or not', async () => {
      const runner = new SandboxedTestRunner(
        VITEST_COMMAND,
        sandbox,
        COVERAGE_TEST_SETTINGS,
      );
      const signal = new AbortController().signal;

      const outputs = [
        await runner.run(requestOf({ runner: 'vitest' }), signal),
        await runner.run(
          requestOf({ runner: 'vitest', withCoverage: false }),
          signal,
        ),
      ];

      expect(outputs.map((output) => output.resultsPath)).toEqual([
        resultsFile(),
        resultsFile(),
      ]);
    });

    it('should give a failing run back as a result', async () => {
      const failed: SandboxCommandResult = {
        outcome: 'exited',
        exitCode: 1,
        output: 'Tests: 1 failed, 1 total\n',
        outputTruncated: false,
        durationMs: 900,
      };
      sandbox.answer(failed);
      const runner = new SandboxedTestRunner(
        JEST_COMMAND,
        sandbox,
        COVERAGE_TEST_SETTINGS,
      );

      const output = await runner.run(
        requestOf({ runner: 'jest' }),
        new AbortController().signal,
      );

      expect(runner.testRunner).toBe('jest');
      expect(output.result).toEqual(failed);
    });

    it('should remove the reports of an earlier run before it starts', async () => {
      const stale = `${REPORT_FOLDER}/coverage-final.json`;
      folder.write(stale, '{}');
      folder.write(RESULTS_FILE, '{}');
      sandbox.onRun(() => {
        expect(existsSync(join(folder.root, stale))).toBe(false);
        expect(existsSync(resultsFile())).toBe(false);
      });

      await run({ runner: 'vitest' });

      expect(sandbox.requests).toHaveLength(1);
    });

    it('should write the files of the command, over what is at their path', async () => {
      folder.write(REPORTER_FILE, 'planted');
      sandbox.onRun(() => {
        expect(readFileSync(reporterFile(), 'utf8')).toContain('onRunComplete');
      });

      await run({ runner: 'jest' });

      expect(sandbox.requests).toHaveLength(1);
    });

    it('should write no reporter for Vitest, which has its own', async () => {
      await run({ runner: 'vitest' });

      expect(existsSync(reporterFile())).toBe(false);
    });

    describe('when the signal is aborted', () => {
      it('should throw what the sandbox throws', async () => {
        const controller = new AbortController();
        controller.abort(new Error('user_cancelled'));

        await expect(
          run({ runner: 'jest' }, controller.signal),
        ).rejects.toThrow('user_cancelled');
      });
    });
  });
});

describe('JEST_COMMAND', () => {
  it('should name every file to measure and write a JSON report', async () => {
    await run({ runner: 'jest', configFile: 'jest.config.json' });

    expect(commandsRun()).toEqual([
      [
        'node',
        'node_modules/jest/bin/jest.js',
        '--ci',
        '--config',
        'jest.config.json',
        '--coverage',
        '--coverageProvider=babel',
        '--coverageReporters=json',
        `--coverageDirectory=${REPORT_FOLDER}`,
        '--collectCoverageFrom=src/used.ts',
        '--collectCoverageFrom=src/\\[id\\].ts',
        '--reporters=default',
        `--reporters=${reporterFile()}`,
      ],
    ]);
  });

  it('should run named tests by their paths, and leave package.json to Jest', async () => {
    await run({
      runner: 'jest',
      configFile: 'package.json',
      testFiles: ['tests/used.test.ts'],
      withCoverage: false,
    });

    expect(commandsRun()).toEqual([
      [
        'node',
        'node_modules/jest/bin/jest.js',
        '--ci',
        '--coverage=false',
        '--reporters=default',
        `--reporters=${reporterFile()}`,
        '--runTestsByPath',
        'tests/used.test.ts',
      ],
    ]);
  });
});

describe('VITEST_COMMAND', () => {
  it('should name every file to measure and write a JSON report', async () => {
    await run({ runner: 'vitest', configFile: 'vitest.config.ts' });

    expect(commandsRun()).toEqual([
      [
        'node',
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.config.ts',
        '--coverage.enabled=true',
        '--coverage.provider=v8',
        '--coverage.reporter=json',
        '--coverage.reportOnFailure=true',
        `--coverage.reportsDirectory=${REPORT_FOLDER}`,
        '--coverage.include=src/used.ts',
        '--coverage.include=src/\\[id\\].ts',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${resultsFile()}`,
      ],
    ]);
  });

  it('should run the named tests without coverage', async () => {
    await run({
      runner: 'vitest',
      testFiles: ['tests/used.test.ts'],
      withCoverage: false,
    });

    expect(commandsRun()).toEqual([
      [
        'node',
        'node_modules/vitest/vitest.mjs',
        'run',
        '--coverage.enabled=false',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${resultsFile()}`,
        'tests/used.test.ts',
      ],
    ]);
  });
});
