import { describe, expect, it } from 'vitest';

import { RunScanHandler } from '#coverage/application/commands/run-scan/run-scan.handler';
import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import type { JobContext } from '#ports/job-handler.port';
import type { JobDocument, JobProgress } from '#ports/job-queue.port';
import {
  type CoverageApplication,
  coverageApplication,
  FIRST_ID,
} from '#tests/support/coverage-application';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';
import { RecordingLogger } from '#tests/support/recording-logger';
import { PASSED } from '#tests/support/recording-sandbox';

/** A sandbox that could not start this time and may start the next. */
class SandboxUnavailableError extends InfrastructureError {
  public readonly code = 'sandbox_unavailable';
  public readonly retryable = true;
}

interface ContextSpec {
  readonly subjectId?: string;
  readonly payload?: JobDocument;
  readonly signal?: AbortSignal;
  readonly heard?: JobProgress[];
}

/** A run of the job `job-1`, which saves through the stand-in transactions. */
function contextOf(
  application: CoverageApplication,
  spec: ContextSpec = {},
): JobContext {
  return {
    jobId: 'job-1',
    subjectId: spec.subjectId ?? REPOSITORY_ID,
    payload: spec.payload ?? { version: 1 },
    leaseToken: 1,
    signal: spec.signal ?? new AbortController().signal,
    commit: async (operation) => application.transactions.run(operation),
    reportProgress: (progress) => {
      spec.heard?.push(progress);
    },
  };
}

function handlerOf(
  application: CoverageApplication,
  logger = new RecordingLogger(),
): RunScanHandler {
  return new RunScanHandler(
    application.repositories,
    application.snapshots,
    application.capture,
    logger,
  );
}

const CAPTURED = {
  status: 'finished',
  outcome: { version: 1, outcome: 'captured', snapshotId: FIRST_ID },
};

describe('RunScanHandler', () => {
  it('should run the jobs of the kind scan', () => {
    expect(handlerOf(coverageApplication()).kind).toBe('scan');
  });

  describe('execute', () => {
    it('should save the snapshot of the head under the job', async () => {
      const application = coverageApplication();

      const result = await handlerOf(application).execute(
        contextOf(application),
      );

      expect(result).toEqual(CAPTURED);
      expect(application.snapshots.saved.map((each) => each.originKey)).toEqual(
        ['scan:job-1'],
      );
      expect(application.repositories.disposed).toEqual(['copy-1']);
    });

    it('should report the steps to the queue', async () => {
      const application = coverageApplication();
      const heard: JobProgress[] = [];

      await handlerOf(application).execute(contextOf(application, { heard }));

      expect(heard.at(-1)?.steps.map(({ status }) => status)).toEqual([
        'passed',
        'passed',
        'passed',
        'passed',
      ]);
    });

    it('should write each step with the ids of the scan', async () => {
      const application = coverageApplication();
      const logger = new RecordingLogger();

      await handlerOf(application, logger).execute(contextOf(application));

      expect(logger.lines).toHaveLength(8);
      expect(logger.lines.at(-1)).toEqual({
        level: 'info',
        message: 'A step of a scan ended.',
        fields: {
          component: 'scan',
          jobId: 'job-1',
          repositoryId: REPOSITORY_ID,
          step: 'read_report',
          outcome: 'passed',
        },
      });
    });

    describe('when it runs again after a crash that followed the save', () => {
      it('should find the snapshot and measure nothing', async () => {
        const application = coverageApplication();
        const handler = handlerOf(application);
        const crashing: JobContext = {
          ...contextOf(application),
          commit: async (operation) => {
            await application.transactions.run(operation);
            throw new Error('The worker stopped before the job completed.');
          },
        };
        await expect(handler.execute(crashing)).rejects.toThrow(
          'The worker stopped before the job completed.',
        );

        const result = await handler.execute(contextOf(application));

        expect(result).toEqual(CAPTURED);
        expect(application.snapshots.saved).toHaveLength(1);
        expect(application.repositories.created).toHaveLength(1);
      });
    });

    describe('when a step fails with a fault that may pass', () => {
      it('should ask for a retry and give the copy back', async () => {
        const application = coverageApplication();
        application.sandbox.onRun(() => {
          throw new SandboxUnavailableError('The sandbox did not start.');
        });

        const result = await handlerOf(application).execute(
          contextOf(application),
        );

        expect(result).toEqual({
          status: 'retry',
          reason: {
            code: 'sandbox_unavailable',
            message: 'The sandbox did not start.',
          },
        });
        expect(application.repositories.disposed).toEqual(['copy-1']);
      });
    });

    describe('when the signal is aborted during a step', () => {
      it('should throw the reason and give the copy back', async () => {
        const application = coverageApplication();
        const stop = new AbortController();
        application.sandbox.onRun(() => {
          stop.abort(new SandboxUnavailableError('The lease was lost.'));
        });

        await expect(
          handlerOf(application).execute(
            contextOf(application, { signal: stop.signal }),
          ),
        ).rejects.toThrow('The lease was lost.');
        expect(application.repositories.disposed).toEqual(['copy-1']);
        expect(application.snapshots.saved).toEqual([]);
      });
    });

    describe('when the payload has a version this service does not read', () => {
      it('should fail the scan with the code of the fault', async () => {
        const application = coverageApplication();

        const result = await handlerOf(application).execute(
          contextOf(application, { payload: { version: 2 } }),
        );

        expect(result).toEqual({
          status: 'finished',
          outcome: {
            version: 1,
            outcome: 'failed',
            code: 'unknown_scan_payload',
            message:
              'A scan job has the payload version 2, and this service ' +
              'reads the version 1.',
          },
        });
      });
    });

    describe('when the subject is not a repository id', () => {
      it('should fail the scan with the code of the fault', async () => {
        const application = coverageApplication();

        const result = await handlerOf(application).execute(
          contextOf(application, { subjectId: 'acme/widgets' }),
        );

        expect(result).toMatchObject({
          status: 'finished',
          outcome: { outcome: 'failed', code: 'invalid_repository_id' },
        });
      });
    });

    describe('when the repository was removed', () => {
      it('should finish with repository_not_found', async () => {
        const application = coverageApplication();
        application.repositories.repository = null;

        const result = await handlerOf(application).execute(
          contextOf(application),
        );

        expect(result).toEqual({
          status: 'finished',
          outcome: { version: 1, outcome: 'repository_not_found' },
        });
        expect(application.repositories.created).toEqual([]);
      });
    });

    describe('when the project is not supported', () => {
      it('should finish with unsupported_project and its reason', async () => {
        const application = coverageApplication();
        application.detector.detection = {
          outcome: 'unsupported',
          reason: 'monorepo',
          detail: 'package.json declares workspaces.',
        };

        const result = await handlerOf(application).execute(
          contextOf(application),
        );

        expect(result).toEqual({
          status: 'finished',
          outcome: {
            version: 1,
            outcome: 'unsupported_project',
            reason: 'monorepo',
            detail: 'package.json declares workspaces.',
          },
        });
      });
    });

    describe('when the install fails', () => {
      it('should finish with install_failed and its output', async () => {
        const application = coverageApplication();
        application.sandbox.answer({ ...PASSED, exitCode: 1 });

        const result = await handlerOf(application).execute(
          contextOf(application),
        );

        expect(result).toEqual({
          status: 'finished',
          outcome: {
            version: 1,
            outcome: 'install_failed',
            outputReference: 'artifact-1',
          },
        });
      });
    });
  });

  describe('onRetriesExhausted', () => {
    it('should leave every snapshot as it is', async () => {
      const application = coverageApplication();

      await handlerOf(application).onRetriesExhausted();

      expect(application.snapshots.saved).toEqual([]);
    });
  });
});
