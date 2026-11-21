import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueueBench, type QueueProcess } from '#tests/support/queue-bench';

const PROGRESS_TICK_MS = 1_000;

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

beforeEach(async () => {
  bench = new QueueBench();
  ({ service: one, jobId } = await bench.openWithScan());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  bench.remove();
});

describe('JobWorkerScheduler', () => {
  describe('start', () => {
    it('should poll, beat and write progress on its timers', async () => {
      one.handler.stopWhenAborted();
      one.scheduler.start();

      await vi.advanceTimersByTimeAsync(one.settings.pollMs);
      expect(one.handler.runs).toHaveLength(1);
      one.handler.latest().context.reportProgress({ steps: [] });
      await vi.advanceTimersByTimeAsync(PROGRESS_TICK_MS);
      expect(bench.stored(jobId)).toMatchObject({
        progress: '{"version":1,"steps":[]}',
      });
      bench.clock.advance(one.settings.heartbeatMs);
      await vi.advanceTimersByTimeAsync(one.settings.heartbeatMs);

      expect(bench.stored(jobId)).toMatchObject({
        lease_expires_at: bench.leaseEnd(one.settings),
      });
      await one.scheduler.stop();
    });
  });

  describe('stop', () => {
    it('should stop the worker and poll no more', async () => {
      one.handler.stopWhenAborted();
      one.scheduler.start();
      await vi.advanceTimersByTimeAsync(one.settings.pollMs);

      const stopping = one.scheduler.stop();
      await vi.advanceTimersByTimeAsync(0);
      await stopping;
      await vi.advanceTimersByTimeAsync(one.settings.pollMs * 3);

      expect(one.handler.runs).toHaveLength(1);
      expect(bench.stored(jobId)).toMatchObject({
        status: 'pending',
        runs: 0,
      });
    });
  });
});
