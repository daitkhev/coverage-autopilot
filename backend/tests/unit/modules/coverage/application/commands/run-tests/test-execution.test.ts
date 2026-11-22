import { describe, expect, it } from 'vitest';

import type { TestExecutionRequest } from '#coverage/application/commands/run-tests/test-execution';
import { TestRunnerUnavailableError } from '#coverage/application/errors/test-runner-unavailable.error';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import { FilePath } from '#kernel/primitives/file-path';
import {
  coverageApplication,
  supportedProject,
} from '#tests/support/coverage-application';
import { fixtureFiles } from '#tests/support/coverage-snapshots';
import { REPORT_PATH } from '#tests/support/coverage-stand-ins';
import { PASSED } from '#tests/support/recording-sandbox';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

const { used, unused, types, broken } = fixtureFiles();

const TEST_FILE = FilePath.create('tests/used.test.ts');

const MEASURED: TestExecutionRequest = {
  workingCopyPath: WORKING_COPY_PATH,
  owner: 'scan:job-1',
  testFiles: [TEST_FILE],
  withCoverage: true,
  detection: supportedProject(),
};

const UNMEASURED: TestExecutionRequest = { ...MEASURED, withCoverage: false };

const RUNNING = new AbortController().signal;

describe('TestExecution', () => {
  describe('run', () => {
    it('should measure the files that parse and hold code', async () => {
      const { tests, runner } = coverageApplication();

      await tests.run(MEASURED, RUNNING);

      expect(runner.requests).toEqual([
        {
          workingCopyPath: WORKING_COPY_PATH,
          project: supportedProject().project,
          parameters: supportedProject().parameters,
          testFiles: [TEST_FILE],
          coverageFiles: [unused.path, used.path],
        },
      ]);
    });

    it('should keep the output of the run for the owner', async () => {
      const { tests, artifacts } = coverageApplication();

      const record = await tests.run(MEASURED, RUNNING);

      expect(artifacts.saved).toEqual([
        { owner: 'scan:job-1', label: 'test-run', content: PASSED.output },
      ]);
      expect(record.outputReference).toBe('artifact-1');
    });

    describe('without coverage', () => {
      it('should read no source and measure nothing', async () => {
        const { tests, runner } = coverageApplication();

        const record = await tests.run(UNMEASURED, RUNNING);

        expect(record.sources).toEqual([]);
        expect(runner.requests[0]?.coverageFiles).toBeNull();
      });
    });

    describe('when the signal is aborted', () => {
      it('should stop before the runner starts', async () => {
        const { tests, runner } = coverageApplication();
        const stop = new AbortController();
        stop.abort(new Error('The user cancelled the scan.'));

        await expect(tests.run(MEASURED, stop.signal)).rejects.toThrow(
          'The user cancelled the scan.',
        );
        expect(runner.requests).toEqual([]);
      });
    });

    describe('when no adapter runs the runner of the project', () => {
      it('should throw TestRunnerUnavailableError', async () => {
        const { tests } = coverageApplication();
        const detection = {
          ...supportedProject(),
          project: DetectedProject.create({
            testRunner: 'vitest',
            testRunnerVersion: '4.0.1',
            packageManager: 'npm',
            configFile: null,
          }),
        };

        await expect(
          tests.run({ ...UNMEASURED, detection }, RUNNING),
        ).rejects.toThrow(
          new TestRunnerUnavailableError(
            'No adapter runs vitest, which the project uses.',
          ),
        );
      });
    });
  });

  describe('readCoverage', () => {
    it('should read the report the runner wrote', async () => {
      const { tests, reader } = coverageApplication();
      const record = await tests.run(MEASURED, RUNNING);

      await tests.readCoverage(record);

      expect(reader.requests).toEqual([
        { workingCopyPath: WORKING_COPY_PATH, reportPath: REPORT_PATH },
      ]);
    });

    it('should give every eligible file exactly one state', async () => {
      const { tests } = coverageApplication();
      const record = await tests.run(MEASURED, RUNNING);

      const measured = await tests.readCoverage(record);

      expect(measured).toEqual({
        files: [types, unused, used],
        unmeasured: [broken],
        reportMissing: false,
      });
    });

    describe('when the runner wrote no report', () => {
      it('should leave each file with code missing from the report', async () => {
        const { tests, runner } = coverageApplication();
        runner.output = {
          result: { ...PASSED, exitCode: 1, output: ' FAIL  src/used.ts \n' },
          reportPath: null,
        };
        const record = await tests.run(MEASURED, RUNNING);

        const { unmeasured, reportMissing } = await tests.readCoverage(record);

        expect(reportMissing).toBe(true);
        expect(unmeasured).toEqual([
          broken,
          UnmeasuredFile.create({
            path: unused.path,
            reason: 'missing_from_report',
            toolMessage: null,
          }),
          UnmeasuredFile.create({
            path: used.path,
            reason: 'missing_from_report',
            toolMessage: 'FAIL  src/used.ts',
          }),
        ]);
      });
    });

    describe('when the report has nothing for a file', () => {
      it('should leave that file missing from the report', async () => {
        const { tests, reader } = coverageApplication();
        reader.report = new Map();
        const record = await tests.run(MEASURED, RUNNING);

        const { files, reportMissing } = await tests.readCoverage(record);

        expect(files).toEqual([FileCoverage.noExecutableCode(types.path)]);
        expect(reportMissing).toBe(false);
      });
    });
  });
});
