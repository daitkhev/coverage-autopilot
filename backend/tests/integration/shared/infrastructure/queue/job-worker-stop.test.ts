import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JobStoppedError } from '#ports/errors/job-stopped.error';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  scanOf,
} from '#tests/support/queue-bench';
import type { ScriptedRun } from '#tests/support/scripted-job-handler';

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

/** Starts to stop the worker and lets the test act once the job heard it. */
async function stopWhileItRuns(): Promise<{
  readonly run: ScriptedRun;
  readonly stopping: Promise<void>;
}> {
  await one.worker.poll();
  const run = one.handler.latest();
  const heard = Promise.withResolvers<undefined>();
  run.context.signal.addEventListener('abort', () => {
    heard.resolve(undefined);
  });
  const stopping = one.worker.stop();
  await heard.promise;
  return { run, stopping };
}

beforeEach(async () => {
  bench = new QueueBench();
  ({ service: one, jobId } = await bench.openWithScan());
});

afterEach(() => {
  bench.remove();
});

describe('JobWorker', () => {
  describe('stop', () => {
    it('should stop every job with worker_shutdown and wait for its handler', async () => {
      const { run, stopping } = await stopWhileItRuns();
      expect(JobStoppedError.reasonOf(run.context.signal)).toBe(
        'worker_shutdown',
      );
      expect(bench.stored(jobId)).toMatchObject({ status: 'leased' });

      run.fail(new JobStoppedError('worker_shutdown'));
      await stopping;

      expect(bench.stored(jobId)).toMatchObject({
        status: 'pending',
        runs: 0,
        lease_expires_at: null,
      });
    });

    it('should complete a job whose handler finished as the worker stopped', async () => {
      const { run, stopping } = await stopWhileItRuns();

      run.finish();
      await stopping;

      expect(bench.stored(jobId)).toMatchObject({ status: 'completed' });
    });

    it('should claim nothing once it has stopped', async () => {
      await one.worker.stop();

      await one.worker.poll();

      expect(one.handler.runs).toEqual([]);
      expect(bench.stored(jobId)).toMatchObject({ status: 'pending' });
    });

    it('should stop a job that a claim took while the worker stopped', async () => {
      one.handler.stopWhenAborted();
      const second = await one.enqueue(scanOf(GADGETS, 'scan-2'));

      const polling = one.worker.poll();
      await one.worker.stop();
      await polling;

      expect(one.handler.runs).toHaveLength(1);
      for (const id of [jobId, second.jobId]) {
        expect(bench.stored(id)).toMatchObject({ status: 'pending', runs: 0 });
      }
    });
  });
});
