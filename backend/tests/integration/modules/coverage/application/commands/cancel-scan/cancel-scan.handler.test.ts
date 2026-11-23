import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancelScanHandler } from '#coverage/application/commands/cancel-scan/cancel-scan.handler';
import { ScanViews } from '#coverage/application/dto/scan-views';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { SNAPSHOT_ID } from '#tests/support/coverage-snapshots';
import { QueueBench, type QueueProcess } from '#tests/support/queue-bench';

const STEP_MS = 1_000;

let bench: QueueBench;
let service: QueueProcess;
let jobId: string;
let views: ScanViews;
let handler: CancelScanHandler;

/** Cancels the scan a moment after the last step, and gives that moment. */
async function cancelLater() {
  bench.clock.advance(STEP_MS);
  const cancelledAt = bench.clock.now();
  const scan = await handler.execute({ scanId: jobId });
  bench.clock.advance(STEP_MS);
  return { scan, cancelledAt };
}

beforeEach(async () => {
  bench = new QueueBench();
  ({ service, jobId } = await bench.openWithScan());
  views = new ScanViews(service.queue);
  handler = new CancelScanHandler(service.transactions, service.queue, views);
});

afterEach(() => {
  bench.remove();
});

describe('CancelScanHandler', () => {
  describe('on the queue of the service', () => {
    it('should cancel a scan that waits, so no worker takes it', async () => {
      const { scan, cancelledAt } = await cancelLater();

      await service.worker.poll();

      expect(scan).toMatchObject({
        status: 'cancelled',
        startedAt: null,
        finishedAt: cancelledAt,
      });
      expect(service.handler.runs).toEqual([]);
    });

    describe('when a worker runs the scan', () => {
      it('should stop the worker at its next heartbeat and stay cancelled', async () => {
        service.handler.stopWhenAborted();
        await service.worker.poll();
        const { scan, cancelledAt } = await cancelLater();

        await service.worker.heartbeat();
        await service.worker.whenIdle();

        const { signal } = service.handler.latest().context;
        expect(JobStoppedError.reasonOf(signal)).toBe('user_cancelled');
        expect(scan).toMatchObject({
          status: 'cancelled',
          finishedAt: cancelledAt,
        });
        expect(await views.find(jobId)).toEqual(scan);
      });

      it('should not complete a scan that finishes after the cancel', async () => {
        await service.worker.poll();
        const { scan } = await cancelLater();

        service.handler.latest().finish({
          version: 1,
          outcome: 'captured',
          snapshotId: SNAPSHOT_ID,
        });
        await service.worker.whenIdle();

        expect(await views.find(jobId)).toEqual(scan);
        expect(scan).toMatchObject({ status: 'cancelled', snapshotId: null });
      });
    });

    describe('when the scan has ended', () => {
      it('should answer the scan as it ended and change nothing', async () => {
        await service.worker.poll();
        service.handler.latest().finish({
          version: 1,
          outcome: 'captured',
          snapshotId: SNAPSHOT_ID,
        });
        await service.worker.whenIdle();
        const ended = await views.find(jobId);

        const { scan } = await cancelLater();

        expect(scan).toEqual(ended);
        expect(scan).toMatchObject({
          status: 'completed',
          snapshotId: SNAPSHOT_ID,
        });
      });
    });
  });
});
