import { describe, expect, it } from 'vitest';

import { ScanRepositoryHandler } from '#coverage/application/commands/scan-repository/scan-repository.handler';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { MissingScanError } from '#coverage/application/errors/missing-scan.error';
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
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
} from '#tests/support/scan-jobs';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

interface Scan {
  readonly handler: ScanRepositoryHandler;
  readonly repositories: StandInRepositories;
  readonly queue: RecordingQueue;
}

/** The queue answers with the queued scan of the tests. */
function scanOf(): Scan {
  const repositories = standInRepositories();
  const queue = recordingQueue();
  queue.answer = { outcome: 'enqueued', jobId: SCAN_ID };
  queue.jobs.set(SCAN_ID, queuedScanJob());
  const handler = new ScanRepositoryHandler(
    repositories,
    instantTransactions(),
    queue,
    new ScanViews(queue),
  );
  return { handler, repositories, queue };
}

const COMMAND = { repositoryId: REPOSITORY_ID, requestKey: 'request-7' };

describe('ScanRepositoryHandler', () => {
  describe('execute', () => {
    it('should queue one scan of the repository in a transaction and give it', async () => {
      const { handler, queue } = scanOf();

      const result = await handler.execute(COMMAND);

      expect(result).toEqual({
        outcome: 'enqueued',
        scan: expect.objectContaining({
          id: SCAN_ID,
          status: 'queued',
        }) as unknown,
      });
      expect(queue.enqueued).toEqual([
        {
          request: {
            kind: 'scan',
            repositoryId: RepositoryId.create(REPOSITORY_ID),
            idempotencyKey: 'scan:request-7',
            subjectId: REPOSITORY_ID,
            payload: { version: 1 },
          },
          transaction: TRANSACTION,
        },
      ]);
    });

    describe('when the key was used before', () => {
      it('should give the scan the key queued as it stands now', async () => {
        const { handler, queue } = scanOf();
        queue.answer = { outcome: 'existing', jobId: SCAN_ID };
        queue.jobs.set(SCAN_ID, runningScanJob());

        const result = await handler.execute(COMMAND);

        expect(result).toMatchObject({
          outcome: 'existing',
          scan: { id: SCAN_ID, status: 'running' },
        });
      });
    });

    describe('when the key was used for another repository', () => {
      it('should answer conflict', async () => {
        const { handler, queue } = scanOf();
        queue.answer = { outcome: 'conflict', jobId: SCAN_ID };

        expect(await handler.execute(COMMAND)).toEqual({ outcome: 'conflict' });
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

      it('should answer repository_not_found for a text that is no id', async () => {
        const { handler, queue } = scanOf();

        const result = await handler.execute({
          ...COMMAND,
          repositoryId: 'acme-widgets',
        });

        expect(result).toEqual({ outcome: 'repository_not_found' });
        expect(queue.enqueued).toEqual([]);
      });
    });

    describe('when the queued job cannot be read back', () => {
      it('should throw MissingScanError', async () => {
        const { handler, queue } = scanOf();
        queue.jobs.clear();

        await expect(handler.execute(COMMAND)).rejects.toThrow(
          new MissingScanError(`No scan job has the id ${SCAN_ID}.`),
        );
      });
    });
  });

  describe('MissingScanError', () => {
    it('should be a fault of the application that is not retried', () => {
      expect(new MissingScanError('x')).toMatchObject({
        name: 'MissingScanError',
        code: 'missing_scan',
        retryable: false,
      });
    });
  });
});
