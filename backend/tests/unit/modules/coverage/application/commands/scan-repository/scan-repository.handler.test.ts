import { describe, expect, it } from 'vitest';

import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { REPOSITORY_ID } from '#tests/support/coverage-snapshots';
import {
  instantTransactions,
  TRANSACTION,
} from '#tests/support/coverage-stand-ins';
import {
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

interface Scan {
  readonly handler: ScanRepositoryHandler;
  readonly repositories: StandInRepositories;
  readonly queue: RecordingQueue;
}

function scanOf(): Scan {
  const repositories = standInRepositories();
  const queue = recordingQueue();
  const handler = new ScanRepositoryHandler(
    repositories,
    instantTransactions(),
    queue,
  );
  return { handler, repositories, queue };
}

const COMMAND = {
  repositoryId: RepositoryId.create(REPOSITORY_ID),
  requestKey: 'request-7',
};

describe('ScanRepositoryHandler', () => {
  describe('execute', () => {
    it('should queue one scan of the repository in a transaction', async () => {
      const { handler, queue } = scanOf();

      const result = await handler.execute(COMMAND);

      expect(result).toEqual({ outcome: 'enqueued', scanId: 'job-1' });
      expect(queue.enqueued).toEqual([
        {
          request: {
            kind: 'scan',
            repositoryId: COMMAND.repositoryId,
            idempotencyKey: 'scan:request-7',
            subjectId: REPOSITORY_ID,
            payload: { version: 1 },
          },
          transaction: TRANSACTION,
        },
      ]);
    });

    describe('when the key was used before', () => {
      it('should answer the scan the key queued', async () => {
        const { handler, queue } = scanOf();
        queue.answer = { outcome: 'existing', jobId: 'job-0' };

        const result = await handler.execute(COMMAND);

        expect(result).toEqual({ outcome: 'existing', scanId: 'job-0' });
      });
    });

    describe('when the repository is not there', () => {
      it('should answer repository_not_found and queue nothing', async () => {
        const { handler, repositories, queue } = scanOf();
        repositories.repository = null;

        const result = await handler.execute(COMMAND);

        expect(result).toEqual({ outcome: 'repository_not_found' });
        expect(queue.enqueued).toEqual([]);
      });
    });
  });
});
