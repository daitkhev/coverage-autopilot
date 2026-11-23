import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InfrastructureError } from '#kernel/errors/infrastructure.error';
import { InvalidCommitShaError } from '#kernel/errors/invalid-commit-sha.error';
import {
  QueueBench,
  type QueueProcess,
  scanOf,
  WIDGETS,
} from '#tests/support/queue-bench';
import type { ScriptedRun } from '#tests/support/scripted-job-handler';

class ToolBusyError extends InfrastructureError {
  public readonly code = 'tool_busy';
  public readonly retryable = true;
}

const SCAN = scanOf(WIDGETS, 'scan-1');

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

/** Claims the job and ends the run the way the test says. */
async function runOnce(end: (run: ScriptedRun) => void): Promise<void> {
  await one.worker.poll();
  end(one.handler.latest());
  await one.worker.whenIdle();
}

async function open(maxRuns: number): Promise<void> {
  one = await bench.open({ maxRuns });
  jobId = (await one.enqueue(SCAN)).jobId;
}

beforeEach(() => {
  bench = new QueueBench();
});

afterEach(() => {
  bench.remove();
});

describe('JobWorker', () => {
  describe('when the handler finished', () => {
    it('should complete the job with its outcome', async () => {
      await open(3);

      await runOnce((run) => {
        run.finish({ version: 2, tests: ['a.test.ts'] });
      });

      expect(await one.queue.getJob(jobId)).toMatchObject({
        status: 'completed',
        runs: 1,
        outcome: { version: 2, tests: ['a.test.ts'] },
      });
      expect(bench.stored(jobId)).toMatchObject({ lease_expires_at: null });
    });
  });

  describe('when the handler asked for a retry', () => {
    it('should put the job back in the queue with the run counted', async () => {
      await open(3);

      await runOnce((run) => {
        run.retry();
      });
      expect(bench.stored(jobId)).toMatchObject({
        status: 'pending',
        runs: 1,
        lease_expires_at: null,
      });
      await one.worker.poll();

      expect(one.handler.latest().context.leaseToken).toBe(2);
      expect(bench.stored(jobId)).toMatchObject({ status: 'leased', runs: 2 });
    });
  });

  describe('when the runs are spent', () => {
    it('should bury the job and tell the handler once', async () => {
      await open(2);

      await runOnce((run) => {
        run.retry();
      });
      await runOnce((run) => {
        run.retry();
      });
      await one.worker.poll();
      await one.worker.whenIdle();

      expect(one.handler.runs).toHaveLength(2);
      expect(one.handler.exhausted).toEqual([
        {
          jobId,
          subjectId: 'scan-1',
          payload: SCAN.payload,
          runs: 2,
        },
      ]);
      expect(bench.stored(jobId)).toMatchObject({ status: 'dead', runs: 2 });
    });

    describe('when the lease of the last run ran out', () => {
      it('should bury the job before any claim, and run it no more', async () => {
        await open(1);
        await one.worker.poll();
        const two = await bench.open({ maxRuns: 1 });

        bench.clock.advance(one.settings.leaseMs);
        await two.worker.poll();
        await two.worker.whenIdle();
        await two.worker.poll();

        expect(two.handler.runs).toEqual([]);
        expect(two.handler.exhausted).toHaveLength(1);
        expect(bench.stored(jobId)).toMatchObject({
          status: 'dead',
          runs: 1,
          lease_token: 2,
        });
      });
    });

    describe('when the handler failed to hear it', () => {
      it('should tell the handler again once the lease ran out', async () => {
        await open(1);
        one.handler.refuseNextExhausted();

        await runOnce((run) => {
          run.retry();
        });
        expect(bench.stored(jobId)).toMatchObject({ status: 'leased' });
        bench.clock.advance(one.settings.leaseMs);
        await one.worker.poll();
        await one.worker.whenIdle();

        expect(one.handler.exhausted).toHaveLength(2);
        expect(bench.stored(jobId)).toMatchObject({ status: 'dead' });
      });
    });
  });

  describe('when the handler throws', () => {
    it('should retry an error that says a rerun can help', async () => {
      await open(3);

      await runOnce((run) => {
        run.fail(new ToolBusyError('The test runner was busy.'));
      });

      expect(bench.stored(jobId)).toMatchObject({ status: 'pending', runs: 1 });
      expect(one.handler.exhausted).toEqual([]);
    });

    it.each([
      ['says a rerun cannot help', new InvalidCommitShaError('"x" is no sha.')],
      ['is of no typed kind', new Error('Something nobody foresaw.')],
      ['is not an error at all', 'a thrown text'],
    ])('should bury the job at once when the error %s', async (_, error) => {
      await open(3);

      await runOnce((run) => {
        run.fail(error);
      });

      expect(bench.stored(jobId)).toMatchObject({ status: 'dead', runs: 1 });
      expect(one.handler.exhausted).toHaveLength(1);
    });
  });

  describe('when the worker stops between the last save and the completion', () => {
    it('should run the handler again at the next claim', async () => {
      await open(3);
      await one.worker.poll();

      one.transactions.refuseNext();
      one.handler.latest().finish();
      await one.worker.whenIdle();
      expect(bench.stored(jobId)).toMatchObject({ status: 'leased' });
      bench.clock.advance(one.settings.leaseMs);
      await runOnce((run) => {
        run.finish();
      });

      expect(one.handler.runs).toHaveLength(2);
      expect(bench.stored(jobId)).toMatchObject({
        status: 'completed',
        runs: 2,
        lease_token: 2,
      });
    });
  });
});
