import { describe, expect, it } from 'vitest';

import type { RunTestsCommand } from '#coverage/application/commands/run-tests/run-tests.command';
import { RunTestsHandler } from '#coverage/application/commands/run-tests/run-tests.handler';
import type {
  TestFailureDto,
  TestOutcomesDto,
} from '#coverage/application/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import {
  type CoverageApplication,
  coverageApplication,
} from '#tests/support/coverage-application';
import {
  FIXTURE_OUTCOMES,
  RESULTS_PATH,
} from '#tests/support/coverage-stand-ins';
import { PASSED } from '#tests/support/recording-sandbox';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

function handlerOf(application: CoverageApplication): RunTestsHandler {
  return new RunTestsHandler(
    application.detector,
    application.tests,
    application.testReports,
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

const FAILING_OUTCOMES: TestOutcomesDto = {
  ran: 3,
  failing: [
    { file: FilePath.create('tests/used.test.ts'), test: 'used calls home' },
  ],
};

const FAILURE: TestFailureDto = {
  file: FilePath.create('tests/used.test.ts'),
  test: null,
  lines: ['● Test suite failed to run'],
};

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
          firstFailure: null,
          outcomes: FIXTURE_OUTCOMES,
        },
        coverage: null,
      });
      expect(application.testReports.requests).toEqual([]);
      expect(application.testReports.outcomeRequests).toEqual([
        { workingCopyPath: WORKING_COPY_PATH, reportPath: RESULTS_PATH },
      ]);
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
              { path: { value: 'src/unused.ts' }, state: 'measured' },
              { path: { value: 'src/used.ts' }, state: 'measured' },
            ],
          },
        });
      });

      it('should judge no file by a threshold, since no repository is named', async () => {
        const application = coverageApplication();

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        const files = result.outcome === 'completed' ? result.coverage : null;
        expect(files?.files.map((file) => 'belowThreshold' in file)).toEqual([
          false,
          false,
          false,
          false,
        ]);
        expect(application.repositories.created).toEqual([]);
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

      it('should tell the first failure the report of the tests names', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, exitCode: 1 },
        };
        application.testReports.failure = FAILURE;

        const result = await handlerOf(application).execute(
          UNMEASURED,
          RUNNING,
        );

        expect(result).toMatchObject({ testRun: { firstFailure: FAILURE } });
        expect(application.testReports.requests).toEqual([
          { workingCopyPath: WORKING_COPY_PATH, reportPath: RESULTS_PATH },
        ]);
      });

      it('should tell which tests ran and which of them failed', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, exitCode: 1 },
        };
        application.testReports.reported = FAILING_OUTCOMES;

        const result = await handlerOf(application).execute(
          UNMEASURED,
          RUNNING,
        );

        expect(result).toMatchObject({
          testRun: { status: 'failed', outcomes: FAILING_OUTCOMES },
        });
      });

      it('should tell no outcomes when the report cannot be read', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, exitCode: 1 },
        };
        application.testReports.reported = null;

        const result = await handlerOf(application).execute(
          UNMEASURED,
          RUNNING,
        );

        expect(result).toMatchObject({ testRun: { outcomes: null } });
      });

      it('should tell no failure when the report names none', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, exitCode: 1 },
        };

        const result = await handlerOf(application).execute(
          UNMEASURED,
          RUNNING,
        );

        expect(result).toMatchObject({ testRun: { firstFailure: null } });
      });
    });

    describe('when the run runs out of time', () => {
      it('should say timed_out and read no coverage', async () => {
        const application = coverageApplication();
        application.runner.output = {
          ...application.runner.output,
          result: { ...PASSED, outcome: 'timed_out', exitCode: null },
          reportPath: null,
        };
        application.testReports.failure = FAILURE;

        const result = await handlerOf(application).execute(MEASURED, RUNNING);

        expect(result).toMatchObject({
          testRun: {
            status: 'timed_out',
            exitCode: null,
            firstFailure: null,
            outcomes: null,
          },
          coverage: null,
        });
        expect(application.reader.requests).toEqual([]);
        expect(application.testReports.requests).toEqual([]);
        expect(application.testReports.outcomeRequests).toEqual([]);
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
