import { assert, describe, expect, it } from 'vitest';

import type { CaptureSnapshotCommand } from '#coverage/application/commands/capture-snapshot/capture-snapshot.command';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type { JobProgress } from '#ports/job-queue.port';
import {
  coverageApplication,
  FIRST_ID,
  supportedProject,
} from '#tests/support/coverage-application';
import {
  CAPTURED_AT,
  fixtureFiles,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';
import { PASSED } from '#tests/support/recording-sandbox';

const COMMAND: CaptureSnapshotCommand = {
  repositoryId: RepositoryId.create(REPOSITORY_ID),
  commit: CommitSha.create(SNAPSHOT_COMMIT),
  originKey: 'improvement:1:baseline',
};

const RUNNING = new AbortController().signal;

describe('SnapshotCapture', () => {
  describe('capture', () => {
    it('should measure the commit in a working copy of its own', async () => {
      const { capture, repositories } = coverageApplication();

      await capture.capture(COMMAND, RUNNING);

      expect(repositories.created).toEqual([
        {
          repositoryId: COMMAND.repositoryId,
          commit: COMMAND.commit,
          purpose: 'snapshot:improvement:1:baseline',
        },
      ]);
      expect(repositories.disposed).toEqual(['copy-1']);
    });

    it('should build the snapshot of every eligible file', async () => {
      const { capture } = coverageApplication();
      const { used, unused, types, broken } = fixtureFiles();

      const result = await capture.capture(COMMAND, RUNNING);

      assert(result.outcome === 'measured');
      const { snapshot } = result;
      expect(snapshot.id.equals(SnapshotId.create(FIRST_ID))).toBe(true);
      expect(snapshot.originKey).toBe('improvement:1:baseline');
      expect(snapshot.project).toEqual(supportedProject().project);
      expect(snapshot.files).toEqual([types, unused, used]);
      expect(snapshot.unmeasured).toEqual([broken]);
      expect(snapshot.testRunOutput).toBe('artifact-2');
      expect(snapshot.capturedAt.toString()).toBe(CAPTURED_AT);
    });

    it('should keep the output of each command under the origin key', async () => {
      const { capture, artifacts } = coverageApplication();

      await capture.capture(COMMAND, RUNNING);

      expect(artifacts.saved.map(({ owner, label }) => [owner, label])).toEqual(
        [
          ['improvement:1:baseline', 'install'],
          ['improvement:1:baseline', 'test-run'],
        ],
      );
    });

    it('should report each step as it ends', async () => {
      const { capture } = coverageApplication();
      const heard: JobProgress[] = [];

      await capture.capture(COMMAND, RUNNING, (progress) => {
        heard.push(progress);
      });

      expect(heard.map(({ steps }) => steps.at(-1)?.status)).toEqual([
        'pending',
        'pending',
        'pending',
        'running',
        'passed',
      ]);
    });

    describe('when the project is not supported', () => {
      it('should answer unsupported and give the copy back', async () => {
        const { capture, detector, repositories } = coverageApplication();
        detector.detection = {
          outcome: 'unsupported',
          reason: 'no_lockfile',
          detail: 'There is no package-lock.json.',
        };

        const result = await capture.capture(COMMAND, RUNNING);

        expect(result).toEqual(detector.detection);
        expect(repositories.disposed).toEqual(['copy-1']);
      });
    });

    describe('when the install fails', () => {
      it('should answer install_failed with its output', async () => {
        const { capture, sandbox } = coverageApplication();
        sandbox.answer({ ...PASSED, exitCode: 1 });

        const result = await capture.capture(COMMAND, RUNNING);

        expect(result).toEqual({
          outcome: 'install_failed',
          outputReference: 'artifact-1',
        });
      });
    });

    describe('when the tests run out of time', () => {
      it('should answer test_run_timed_out with its output', async () => {
        const { capture, runner } = coverageApplication();
        runner.output = {
          result: { ...PASSED, outcome: 'timed_out', exitCode: null },
          reportPath: null,
        };

        const result = await capture.capture(COMMAND, RUNNING);

        expect(result).toEqual({
          outcome: 'test_run_timed_out',
          outputReference: 'artifact-2',
        });
      });
    });

    describe('when a step fails', () => {
      it('should give the copy back and throw the fault', async () => {
        const { capture, sandbox, repositories } = coverageApplication();
        sandbox.onRun(() => {
          throw new Error('The sandbox did not start.');
        });

        await expect(capture.capture(COMMAND, RUNNING)).rejects.toThrow(
          'The sandbox did not start.',
        );
        expect(repositories.disposed).toEqual(['copy-1']);
      });
    });

    describe('when the signal is aborted during a step', () => {
      it('should give the copy back and stop', async () => {
        const { capture, sandbox, repositories } = coverageApplication();
        const stop = new AbortController();
        sandbox.onRun(() => {
          stop.abort(new Error('The user cancelled the scan.'));
        });

        await expect(capture.capture(COMMAND, stop.signal)).rejects.toThrow(
          'The user cancelled the scan.',
        );
        expect(repositories.disposed).toEqual(['copy-1']);
      });
    });
  });
});
