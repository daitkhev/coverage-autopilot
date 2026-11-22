import { describe, expect, it } from 'vitest';

import type { CaptureSnapshotCommand } from '#coverage/application/commands/capture-snapshot/capture-snapshot.command';
import { CaptureSnapshotHandler } from '#coverage/application/commands/capture-snapshot/capture-snapshot.handler';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  type CoverageApplication,
  coverageApplication,
  FIRST_ID,
} from '#tests/support/coverage-application';
import {
  fixtureSnapshot,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
  SNAPSHOT_ID,
} from '#tests/support/coverage-snapshots';
import { TRANSACTION } from '#tests/support/coverage-stand-ins';
import { PASSED } from '#tests/support/recording-sandbox';
import { judgeBy } from '#tests/support/stand-in-repositories';

const COMMAND: CaptureSnapshotCommand = {
  repositoryId: RepositoryId.create(REPOSITORY_ID),
  commit: CommitSha.create(SNAPSHOT_COMMIT),
  originKey: 'improvement:1:baseline',
};

const RUNNING = new AbortController().signal;

function handlerOf(application: CoverageApplication): CaptureSnapshotHandler {
  return new CaptureSnapshotHandler(
    application.snapshots,
    application.capture,
    application.transactions,
    application.thresholds,
  );
}

describe('CaptureSnapshotHandler', () => {
  describe('execute', () => {
    it('should save the snapshot in one transaction', async () => {
      const application = coverageApplication();

      const result = await handlerOf(application).execute(COMMAND, RUNNING);

      expect(application.transactions.count()).toBe(1);
      expect(application.snapshots.saved).toHaveLength(1);
      expect(result).toMatchObject({
        outcome: 'captured',
        snapshot: {
          id: FIRST_ID,
          originKey: 'improvement:1:baseline',
          threshold: { metric: 'lines', percentage: 80 },
          files: { below: 2, above: 0, unmeasured: 1, noCode: 1 },
        },
      });
    });

    describe('when the repository has a threshold of its own', () => {
      it('should split the snapshot under it', async () => {
        const application = coverageApplication();
        judgeBy(application.repositories, 30);

        const result = await handlerOf(application).execute(COMMAND, RUNNING);

        expect(result).toMatchObject({
          snapshot: {
            threshold: { metric: 'lines', percentage: 30 },
            files: { below: 1, above: 1 },
          },
        });
      });
    });

    describe('when a snapshot has the origin key already', () => {
      it('should answer it and measure nothing', async () => {
        const application = coverageApplication();
        await application.snapshots.save(
          fixtureSnapshot({ originKey: COMMAND.originKey }),
          TRANSACTION,
        );

        const result = await handlerOf(application).execute(COMMAND, RUNNING);

        expect(result).toMatchObject({
          outcome: 'captured',
          snapshot: { id: SNAPSHOT_ID },
        });
        expect(application.repositories.created).toEqual([]);
      });
    });

    describe('when the capture is refused', () => {
      it('should answer the refusal and save nothing', async () => {
        const application = coverageApplication();
        application.sandbox.answer({ ...PASSED, exitCode: 1 });

        const result = await handlerOf(application).execute(COMMAND, RUNNING);

        expect(result).toEqual({
          outcome: 'install_failed',
          outputReference: 'artifact-1',
        });
        expect(application.snapshots.saved).toEqual([]);
      });
    });
  });
});
