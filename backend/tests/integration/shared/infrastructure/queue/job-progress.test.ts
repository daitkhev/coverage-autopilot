import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Instant } from '#kernel/time/instant';
import type { JobProgress } from '#ports/job-queue.port';
import {
  QueueBench,
  type QueueProcess,
  START,
} from '#tests/support/queue-bench';

const CLONING: JobProgress = {
  steps: [
    { code: 'clone', status: 'running' },
    { code: 'install', status: 'pending' },
  ],
};

const INSTALLING: JobProgress = {
  steps: [
    { code: 'clone', status: 'passed' },
    { code: 'install', status: 'running', done: 1, total: 3 },
  ],
};

const SECOND = 1_000;

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

async function shown(): Promise<JobProgress['steps'] | undefined> {
  return (await one.queue.getProgress('scan-1'))?.steps;
}

function report(progress: JobProgress): void {
  one.handler.latest().context.reportProgress(progress);
}

beforeEach(async () => {
  bench = new QueueBench();
  ({ service: one, jobId } = await bench.openWithScan());
});

afterEach(() => {
  bench.remove();
});

describe('JobWorker', () => {
  describe('writeProgress', () => {
    beforeEach(async () => {
      await one.worker.poll();
    });

    it('should write what the handler reported, with the time', async () => {
      report(CLONING);

      await one.worker.writeProgress();

      expect(await one.queue.getProgress('scan-1')).toEqual({
        jobId,
        updatedAt: Instant.parse(START),
        steps: CLONING.steps,
      });
    });

    it('should write nothing when nothing was reported', async () => {
      await one.worker.writeProgress();

      expect(bench.stored(jobId)).toMatchObject({ progress: null });
    });

    it('should write at most once a second, and then the latest report', async () => {
      report(CLONING);
      await one.worker.writeProgress();

      report(INSTALLING);
      await one.worker.writeProgress();
      bench.clock.advance(SECOND - 1);
      await one.worker.writeProgress();
      expect(await shown()).toEqual(CLONING.steps);
      bench.clock.advance(1);
      await one.worker.writeProgress();

      expect(await shown()).toEqual(INSTALLING.steps);
    });

    describe('when the database refused a write', () => {
      it('should drop that report and write the next one', async () => {
        report(CLONING);
        one.transactions.refuseNext();
        await one.worker.writeProgress();
        bench.clock.advance(SECOND);
        await one.worker.writeProgress();
        expect(await shown()).toBeUndefined();

        report(INSTALLING);
        await one.worker.writeProgress();

        expect(await shown()).toEqual(INSTALLING.steps);
      });
    });
  });

  describe('getProgress', () => {
    it('should give nothing while the job waits', async () => {
      expect(await one.queue.getProgress('scan-1')).toBeNull();
    });

    it('should give nothing after a claim, before the handler reports', async () => {
      await one.worker.poll();

      expect(await one.queue.getProgress('scan-1')).toBeNull();
    });

    it('should give nothing of a job that has ended', async () => {
      await one.worker.poll();
      report(CLONING);
      await one.worker.writeProgress();

      one.handler.latest().finish();
      await one.worker.whenIdle();

      expect(bench.stored(jobId)).toMatchObject({ status: 'completed' });
      expect(await one.queue.getProgress('scan-1')).toBeNull();
    });

    it('should never show the steps of an earlier run', async () => {
      await one.worker.poll();
      report(CLONING);
      await one.worker.writeProgress();
      one.handler.latest().retry();
      await one.worker.whenIdle();

      await one.worker.poll();

      expect(bench.stored(jobId)).toMatchObject({
        status: 'leased',
        progress: null,
        progress_updated_at: null,
      });
      expect(await one.queue.getProgress('scan-1')).toBeNull();
    });
  });
});
