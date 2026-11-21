import { describe, expect, it } from 'vitest';

import type { RunTestsCommand } from '#coverage/application/commands/run-tests/run-tests.command';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import {
  type CoverageApplication,
  coverageApplication,
} from '#tests/support/coverage-application';
import {
  COVERAGE_TEST_SETTINGS,
  PASSED,
} from '#tests/support/recording-sandbox';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

function handlerOf(application: CoverageApplication): RunTestsHandler {
  return new RunTestsHandler(
    application.detector,
    application.tests,
    COVERAGE_TEST_SETTINGS,
  );
}

const MEASURED: RunTestsCommand = {
  workingCopyPath: WORKING_COPY_PATH,
  owner: 'improvement:1',
  testFiles: [],
  withCoverage: true,
};

const UNMEASURED: RunTestsCommand = { ...MEASURED, withCoverage: false };

const RUNNING = new AbortController().signal;

describe('RunTestsHandler', () => {
  describe('execute', () => {
    it('should describe the run that passed', async () => {
      const application = coverageApplication();

      const result = await handlerOf(application).execute(UNMEASURED, RUNNING);

      expect(result).toEqual({
        outcome: 'completed',
        testRun: {
          status: 'passed',
          exitCode: 0,
          durationMs: PASSED.durationMs,
          outputReference: 'artifact-1',
        },
        coverage: null,
      });
    });

    describe('with coverage', () => {
      it('should give every eligible file in path order', async () => {
        const application = coverageApplication();

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        expect(result).toMatchObject({
          coverage: {
            parameters: { testRunner: 'jest', coverageProvider: 'babel' },
            files: [
              { path: { value: 'src/broken.ts' }, state: 'unmeasured' },
              { path: { value: 'src/types.ts' }, state: 'no_executable_code' },
              { path: { value: 'src/unused.ts' }, belowThreshold: true },
              { path: { value: 'src/used.ts' }, state: 'measured' },
            ],
          },
        });
      });
    });

    describe('when a test fails', () => {
      it('should say failed and still read the coverage', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, exitCode: 1 },
        };

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        expect(result).toMatchObject({
          testRun: { status: 'failed', exitCode: 1 },
          coverage: { files: { length: 4 } },
        });
      });
    });

    describe('when the run runs out of time', () => {
      it('should say timed_out and read no coverage', async () => {
        const application = coverageApplication();
        application.runner.output = {
          result: { ...PASSED, outcome: 'timed_out', exitCode: null },
          reportPath: null,
        };

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        expect(result).toMatchObject({
          testRun: { status: 'timed_out', exitCode: null },
          coverage: null,
        });
        expect(application.reader.requests).toEqual([]);
      });
    });

    describe('when the project is not supported', () => {
      it('should answer unsupported and run nothing', async () => {
        const application = coverageApplication();
        application.detector.detection = {
          outcome: 'unsupported',
          reason: 'no_test_runner',
          detail: 'package.json declares neither jest nor vitest.',
        };

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        expect(result).toEqual(application.detector.detection);
        expect(application.runner.requests).toEqual([]);
      });
    });
  });
});
