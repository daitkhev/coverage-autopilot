import { beforeEach, describe, expect, it } from 'vitest';

import { ScanViews } from '#coverage/application/dto/scan-views';
import { GetScanHandler } from '#coverage/application/queries/get-scan/get-scan.handler';
import { Instant } from '#kernel/time/instant';
import {
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';
import {
  ENDED_AT,
  endedScanJob,
  queuedScanJob,
  runningScanJob,
  SCAN_ID,
  STARTED_AT,
} from '#tests/support/scan-jobs';

const STEPS = [{ code: 'test_run', status: 'running' }] as const;

const WRITTEN_AT = Instant.parse(STARTED_AT).plusMilliseconds(1_000);

let queue: RecordingQueue;
let handler: GetScanHandler;

beforeEach(() => {
  queue = recordingQueue();
  handler = new GetScanHandler(new ScanViews(queue));
});

describe('GetScanHandler', () => {
  describe('execute', () => {
    it('should answer a running scan with the steps its worker wrote', async () => {
      queue.jobs.set(SCAN_ID, runningScanJob());
      queue.progress = { jobId: SCAN_ID, steps: STEPS, updatedAt: WRITTEN_AT };

      const scan = await handler.execute({ scanId: SCAN_ID });

      expect(scan).toMatchObject({
        id: SCAN_ID,
        status: 'running',
        progress: { steps: STEPS, updatedAt: WRITTEN_AT },
      });
    });

    it('should answer a scan that ended with its end and no steps', async () => {
      queue.jobs.set(SCAN_ID, endedScanJob('cancelled'));
      queue.progress = { jobId: SCAN_ID, steps: STEPS, updatedAt: WRITTEN_AT };

      const scan = await handler.execute({ scanId: SCAN_ID });

      expect(scan).toMatchObject({
        status: 'cancelled',
        finishedAt: Instant.parse(ENDED_AT),
        progress: null,
      });
    });

    describe('when the steps of its repository belong to another scan', () => {
      it('should answer the scan with no steps', async () => {
        queue.jobs.set(SCAN_ID, runningScanJob());
        queue.progress = {
          jobId: 'job-9',
          steps: STEPS,
          updatedAt: WRITTEN_AT,
        };

        const scan = await handler.execute({ scanId: SCAN_ID });

        expect(scan).toMatchObject({ status: 'running', progress: null });
      });
    });

    describe('when no scan has the id', () => {
      it('should answer null', async () => {
        await expect(handler.execute({ scanId: SCAN_ID })).resolves.toBeNull();
      });

      it('should answer null for a job of another kind', async () => {
        queue.jobs.set(SCAN_ID, { ...queuedScanJob(), kind: 'improvement' });

        await expect(handler.execute({ scanId: SCAN_ID })).resolves.toBeNull();
      });
    });
  });
});
