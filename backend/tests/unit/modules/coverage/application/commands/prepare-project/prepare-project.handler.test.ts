import { describe, expect, it } from 'vitest';

import {
  coverageApplication,
  INSTALL_COMMAND,
  supportedProject,
} from '#tests/support/coverage-application';
import {
  COVERAGE_TEST_SETTINGS,
  PASSED,
} from '#tests/support/recording-sandbox';
import { WORKING_COPY_PATH } from '#tests/support/stand-in-repositories';

const LOAN = { workingCopyPath: WORKING_COPY_PATH, owner: 'improvement:1' };

describe('PrepareProjectHandler', () => {
  describe('execute', () => {
    it('should install the locked packages with the network open', async () => {
      const { preparation, sandbox } = coverageApplication();

      await preparation.execute(LOAN, new AbortController().signal);

      expect(sandbox.requests).toEqual([
        {
          workingCopyPath: WORKING_COPY_PATH,
          command: INSTALL_COMMAND,
          environment: COVERAGE_TEST_SETTINGS.commandEnvironment,
          network: 'open',
          timeoutMs: COVERAGE_TEST_SETTINGS.installTimeoutMs,
        },
      ]);
    });

    it('should keep the output of the install for the owner', async () => {
      const { preparation, artifacts } = coverageApplication();

      await preparation.execute(LOAN, new AbortController().signal);

      expect(artifacts.saved).toEqual([
        { owner: 'improvement:1', label: 'install', content: PASSED.output },
      ]);
    });

    describe('when the install passes', () => {
      it('should answer ready with the detection', async () => {
        const { preparation } = coverageApplication();

        const preparing = await preparation.execute(
          LOAN,
          new AbortController().signal,
        );

        expect(preparing).toEqual({
          outcome: 'ready',
          detection: supportedProject(),
        });
      });
    });

    describe('when the project is not supported', () => {
      it('should answer unsupported and install nothing', async () => {
        const { preparation, detector, sandbox } = coverageApplication();
        detector.detection = {
          outcome: 'unsupported',
          reason: 'monorepo',
          detail: 'package.json declares workspaces.',
        };

        const preparing = await preparation.execute(
          LOAN,
          new AbortController().signal,
        );

        expect(preparing).toEqual(detector.detection);
        expect(sandbox.requests).toEqual([]);
      });
    });

    describe('when the install exits with an error', () => {
      it('should answer install_failed with the exit code', async () => {
        const { preparation, sandbox } = coverageApplication();
        sandbox.answer({ ...PASSED, exitCode: 1, output: 'npm ERR! 404' });

        const preparing = await preparation.execute(
          LOAN,
          new AbortController().signal,
        );

        expect(preparing).toEqual({
          outcome: 'install_failed',
          exitCode: 1,
          outputReference: 'artifact-1',
        });
      });
    });

    describe('when the install runs out of time', () => {
      it('should answer install_failed with no exit code', async () => {
        const { preparation, sandbox } = coverageApplication();
        sandbox.answer({ ...PASSED, outcome: 'timed_out', exitCode: null });

        const preparing = await preparation.execute(
          LOAN,
          new AbortController().signal,
        );

        expect(preparing).toMatchObject({
          outcome: 'install_failed',
          exitCode: null,
        });
      });
    });
  });
});
