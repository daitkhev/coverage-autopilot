import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RepositoryId } from '#kernel/primitives/repository-id';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  scanOf,
  WIDGETS,
} from '#tests/support/queue-bench';

const TOOLS = RepositoryId.create('00000000-0000-4000-8000-00000000a003');

const WAIT_MS = 60_000;

let bench: QueueBench;

function leasedRows(): unknown[] {
  return bench.connection
    .prepare(
      `SELECT serialization_key FROM jobs WHERE status = 'leased'
       ORDER BY serialization_key`,
    )
    .all()
    .map((row) => row['serialization_key']);
}

function subjectsOf(service: QueueProcess): string[] {
  return service.handler.runs.map((run) => run.context.subjectId);
}

/**
 * One after the other: in one thread, a connection that waits for the
 * lock of SQLite would block the connection that holds it.
 */
async function pollInTurn(...services: QueueProcess[]): Promise<void> {
  for (const service of services) {
    await service.worker.poll();
  }
}

beforeEach(() => {
  bench = new QueueBench();
});

afterEach(() => {
  bench.remove();
});

describe('JobWorker', () => {
  describe('poll', () => {
    it('should lease a waiting job with a new token and count the run', async () => {
      const service = await bench.open();
      const { jobId } = await service.enqueue(scanOf(WIDGETS, 'scan-1'));

      await service.worker.poll();

      expect(service.handler.latest().context).toMatchObject({
        jobId,
        subjectId: 'scan-1',
        payload: { version: 1, branch: 'main' },
        leaseToken: 1,
      });
      expect(bench.stored(jobId)).toMatchObject({
        status: 'leased',
        runs: 1,
        lease_token: 1,
        lease_expires_at: bench.leaseEnd(service.settings),
      });
    });

    it('should claim nothing when no job waits', async () => {
      const service = await bench.open();

      await service.worker.poll();

      expect(service.handler.runs).toEqual([]);
    });

    it('should take the oldest waiting job first', async () => {
      const service = await bench.open({ jobsAtOnce: 1 });
      await service.enqueue(scanOf(GADGETS, 'older'));
      bench.clock.advance(1);
      await service.enqueue(scanOf(WIDGETS, 'newer'));

      await service.worker.poll();

      expect(subjectsOf(service)).toEqual(['older']);
    });

    describe('when a job waits for a moment', () => {
      it('should leave it until the moment comes', async () => {
        const service = await bench.open();
        await service.enqueue({
          ...scanOf(WIDGETS, 'later'),
          notBefore: bench.clock.now().plusMilliseconds(WAIT_MS),
        });
        await service.enqueue(scanOf(GADGETS, 'now'));

        await service.worker.poll();

        expect(subjectsOf(service)).toEqual(['now']);

        bench.clock.advance(WAIT_MS);
        await service.worker.poll();

        expect(subjectsOf(service)).toEqual(['now', 'later']);
      });

      it('should not hold its repository meanwhile', async () => {
        const service = await bench.open();
        await service.enqueue({
          ...scanOf(WIDGETS, 'later'),
          notBefore: bench.clock.now().plusMilliseconds(WAIT_MS),
        });
        await service.enqueue(scanOf(WIDGETS, 'now'));

        await service.worker.poll();

        expect(subjectsOf(service)).toEqual(['now']);
      });
    });

    it('should take no job of a kind it has no handler for', async () => {
      const service = await bench.open();
      await service.enqueue({
        ...scanOf(WIDGETS, 'improvement-1'),
        kind: 'improvement',
      });

      await service.worker.poll();

      expect(service.handler.runs).toEqual([]);
    });

    it('should run as many jobs at once as its settings allow', async () => {
      const service = await bench.open({ jobsAtOnce: 2 });
      for (const [repository, subject] of [
        [WIDGETS, 'first'],
        [GADGETS, 'second'],
        [TOOLS, 'third'],
      ] as const) {
        await service.enqueue(scanOf(repository, subject));
      }

      await service.worker.poll();
      expect(subjectsOf(service)).toEqual(['first', 'second']);
      for (const run of service.handler.runs) {
        run.finish();
      }
      await service.worker.whenIdle();
      await service.worker.poll();

      expect(subjectsOf(service)).toEqual(['first', 'second', 'third']);
    });

    it('should not take more places when two polls overlap', async () => {
      const service = await bench.open({ jobsAtOnce: 2 });
      await service.enqueue(scanOf(WIDGETS, 'first'));
      await service.enqueue(scanOf(GADGETS, 'second'));
      await service.enqueue(scanOf(TOOLS, 'third'));

      await Promise.all([service.worker.poll(), service.worker.poll()]);

      expect(subjectsOf(service)).toEqual(['first', 'second']);
    });

    describe('when the database refused the claim', () => {
      it('should claim at the next poll', async () => {
        const service = await bench.open();
        await service.enqueue(scanOf(WIDGETS, 'scan-1'));

        service.transactions.refuseNext();
        await service.worker.poll();
        expect(service.handler.runs).toEqual([]);
        await service.worker.poll();

        expect(subjectsOf(service)).toEqual(['scan-1']);
      });
    });

    describe('when two workers share one database', () => {
      let one: QueueProcess;
      let two: QueueProcess;

      beforeEach(async () => {
        one = await bench.open();
        two = await bench.open();
      });

      it('should never give one job to both', async () => {
        await one.enqueue(scanOf(WIDGETS, 'scan-1'));

        await pollInTurn(one, two);

        expect(subjectsOf(one)).toEqual(['scan-1']);
        expect(subjectsOf(two)).toEqual([]);
      });

      it('should run one job of a repository at a time', async () => {
        await one.enqueue(scanOf(WIDGETS, 'scan-1'));
        await one.enqueue(scanOf(WIDGETS, 'scan-2'));

        await pollInTurn(one, two);

        expect(subjectsOf(one)).toEqual(['scan-1']);
        expect(subjectsOf(two)).toEqual([]);
        expect(leasedRows()).toEqual([WIDGETS.value]);
      });

      it('should run two repositories side by side', async () => {
        await one.enqueue(scanOf(WIDGETS, 'scan-1'));
        await pollInTurn(one);
        await one.enqueue(scanOf(GADGETS, 'scan-2'));

        await pollInTurn(two);

        expect(subjectsOf(one)).toEqual(['scan-1']);
        expect(subjectsOf(two)).toEqual(['scan-2']);
        expect(leasedRows()).toEqual([WIDGETS.value, GADGETS.value]);
      });

      it('should take a job whose lease ran out before a waiting one', async () => {
        const { jobId } = await one.enqueue(scanOf(WIDGETS, 'stalled'));
        await pollInTurn(one);
        await one.enqueue(scanOf(GADGETS, 'waiting'));

        bench.clock.advance(one.settings.leaseMs);
        await pollInTurn(two);

        expect(subjectsOf(two)).toEqual(['stalled', 'waiting']);
        expect(two.handler.runs[0]?.context.leaseToken).toBe(2);
        expect(bench.stored(jobId)).toMatchObject({
          status: 'leased',
          runs: 2,
          lease_token: 2,
          lease_expires_at: bench.leaseEnd(two.settings),
        });
      });

      it('should leave a repository to the worker that still runs its job', async () => {
        const { jobId } = await one.enqueue(scanOf(WIDGETS, 'cancelled'));
        await pollInTurn(one);
        await one.transactions.run(async (transaction) =>
          one.queue.cancel(jobId, transaction),
        );
        await one.enqueue(scanOf(WIDGETS, 'next'));

        await pollInTurn(one, two);

        expect(subjectsOf(one)).toEqual(['cancelled']);
        expect(subjectsOf(two)).toEqual(['next']);
      });
    });
  });
});
