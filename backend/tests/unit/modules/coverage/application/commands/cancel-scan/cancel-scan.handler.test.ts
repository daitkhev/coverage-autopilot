import { beforeEach, describe, expect, it } from 'vitest';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { Instant } from '#kernel/time/instant';
import type { JobDto } from '#ports/job-queue.port';
import { SNAPSHOT_ID } from '#tests/support/coverage-snapshots';
import {
  type InstantTransactions,
  instantTransactions,
  TRANSACTION,
} from '#tests/support/coverage-stand-ins';
import {
  CANCELLED_AT,
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';
import {
  ENDED_AT,
  endedScanJob,
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
} from '#tests/support/scan-jobs';

let queue: RecordingQueue;
let transactions: InstantTransactions;
let handler: CancelScanHandler;

beforeEach(() => {
  queue = recordingQueue();
  transactions = instantTransactions();
  handler = new CancelScanHandler(transactions, queue, new ScanViews(queue));
});

describe('CancelScanHandler', () => {
  describe('execute', () => {
    it.each([
      ['waits', queuedScanJob()],
      ['runs', runningScanJob()],
    ])(
      'should cancel a scan that %s through its job, in a transaction',
      async (_, job) => {
        queue.jobs.set(SCAN_ID, job);

        const scan = await handler.execute({ scanId: SCAN_ID });

        expect(queue.cancelledJobs).toEqual([
          { jobId: SCAN_ID, transaction: TRANSACTION },
        ]);
        expect(transactions.count()).toBe(1);
        expect(scan).toMatchObject({
          id: SCAN_ID,
          status: 'cancelled',
          finishedAt: CANCELLED_AT,
          progress: null,
        });
      },
    );

    describe('when the scan has ended', () => {
      it.each<[string, JobDto, Record<string, unknown>]>([
        [
          'completed',
          endedScanJob('completed', {
            version: 1,
            outcome: 'captured',
            snapshotId: SNAPSHOT_ID,
          }),
          { status: 'completed', snapshotId: SNAPSHOT_ID },
        ],
        [
          'failed',
          endedScanJob('dead'),
          { status: 'failed', failure: { reason: 'retries_exhausted' } },
        ],
        ['been cancelled', endedScanJob('cancelled'), { status: 'cancelled' }],
      ])(
        'should leave a scan that %s as it is and answer it',
        async (_, job, answer) => {
          queue.jobs.set(SCAN_ID, job);

          const scan = await handler.execute({ scanId: SCAN_ID });

          expect(scan).toMatchObject({
            ...answer,
            finishedAt: Instant.parse(ENDED_AT),
          });
          expect(queue.cancelledJobs).toEqual([]);
          expect(transactions.count()).toBe(0);
        },
      );
    });

    describe('when no scan has the id', () => {
      it('should answer null and cancel nothing', async () => {
        const scan = await handler.execute({ scanId: SCAN_ID });

        expect(scan).toBeNull();
        expect(queue.cancelledJobs).toEqual([]);
      });

      it('should answer null for a job of another kind', async () => {
        queue.jobs.set(SCAN_ID, { ...queuedScanJob(), kind: 'improvement' });

        const scan = await handler.execute({ scanId: SCAN_ID });

        expect(scan).toBeNull();
        expect(queue.cancelledJobs).toEqual([]);
      });
    });
  });
});
