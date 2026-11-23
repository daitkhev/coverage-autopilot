import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteTransaction } from '#infrastructure/database/sqlite-transaction';
import type { Transaction } from '#kernel/transaction/transaction';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';
import type { JobContext } from '#ports/job-handler.port';
import { QueueBench, type QueueProcess } from '#tests/support/queue-bench';

const STEPS = { steps: [{ code: 'clone', status: 'running' }] } as const;

let bench: QueueBench;
let one: QueueProcess;
let jobId: string;

/** A row the handler saves for its own object. */
async function save(context: JobContext, value: string): Promise<string> {
  return context.commit(async (transaction: Transaction) => {
    SqliteTransaction.connectionOf(transaction)
      .prepare('INSERT INTO saves (value) VALUES (?)')
      .run(value);
    return Promise.resolve(value);
  });
}

function saves(): unknown[] {
  return bench.connection
    .prepare('SELECT value FROM saves ORDER BY rowid')
    .all()
    .map((row) => row['value']);
}

async function cancel(): Promise<void> {
  await one.transactions.run(async (transaction) =>
    one.queue.cancel(jobId, transaction),
  );
}

beforeEach(async () => {
  bench = new QueueBench();
  bench.connection.exec('CREATE TABLE saves (value TEXT NOT NULL) STRICT');
  ({ service: one, jobId } = await bench.openWithScan());
  await one.worker.poll();
});

afterEach(() => {
  bench.remove();
});

describe('JobLease', () => {
  describe('commit', () => {
    it('should save in the transaction that checks the lease', async () => {
      expect(await save(one.handler.latest().context, 'report')).toBe('report');
      expect(saves()).toEqual(['report']);
    });

    describe('when the lease ran out and nobody claimed the job', () => {
      it('should still save and complete the job', async () => {
        bench.clock.advance(one.settings.leaseMs * 2);

        await save(one.handler.latest().context, 'late but alone');
        one.handler.latest().finish();
        await one.worker.whenIdle();

        expect(saves()).toEqual(['late but alone']);
        expect(bench.stored(jobId)).toMatchObject({ status: 'completed' });
      });
    });

    describe('when another worker claimed the job', () => {
      let two: QueueProcess;

      beforeEach(async () => {
        bench.clock.advance(one.settings.leaseMs);
        two = await bench.open();
        await two.worker.poll();
      });

      it('should give the second claim a larger token', () => {
        expect(two.handler.latest().context.leaseToken).toBeGreaterThan(
          one.handler.latest().context.leaseToken,
        );
      });

      it('should run nothing, save nothing and stop with lease_lost', async () => {
        const stale = one.handler.latest().context;

        await expect(save(stale, 'stale')).rejects.toThrow(
          new LeaseLostError(
            `Job ${jobId} is no longer leased with token 1, so nothing ` +
              'was saved.',
          ),
        );

        expect(saves()).toEqual([]);
        expect(JobStoppedError.reasonOf(stale.signal)).toBe('lease_lost');
      });

      it('should write no heartbeat and no progress', async () => {
        const before = bench.stored(jobId);

        one.handler.latest().context.reportProgress(STEPS);
        bench.clock.advance(one.settings.heartbeatMs);
        await one.worker.heartbeat();
        await one.worker.writeProgress();
        await one.worker.heartbeat();

        expect(bench.stored(jobId)).toEqual(before);
      });

      it('should not complete the job', async () => {
        one.handler.latest().finish();
        await one.worker.whenIdle();

        expect(bench.stored(jobId)).toMatchObject({
          status: 'leased',
          lease_token: 2,
          outcome: null,
        });
      });
    });

    describe('when the user cancelled the job', () => {
      it('should save nothing and stop with user_cancelled', async () => {
        const context = one.handler.latest().context;
        await cancel();

        await expect(save(context, 'after cancel')).rejects.toThrow(
          LeaseLostError,
        );

        expect(saves()).toEqual([]);
        expect(JobStoppedError.reasonOf(context.signal)).toBe('user_cancelled');
      });
    });
  });

  describe('heartbeat', () => {
    it('should extend the lease from the time it beats', async () => {
      bench.clock.advance(one.settings.heartbeatMs);

      await one.worker.heartbeat();

      expect(bench.stored(jobId)).toMatchObject({
        status: 'leased',
        lease_token: 1,
        lease_expires_at: bench.leaseEnd(one.settings),
      });
    });

    it('should stop a job the user cancelled, which stays cancelled', async () => {
      const run = one.handler.latest();
      await cancel();

      await one.worker.heartbeat();
      expect(JobStoppedError.reasonOf(run.context.signal)).toBe(
        'user_cancelled',
      );
      run.retry();
      await one.worker.whenIdle();

      expect(bench.stored(jobId)).toMatchObject({
        status: 'cancelled',
        runs: 1,
      });
    });

    describe('when the database refused it', () => {
      it('should keep the job and extend the lease at the next beat', async () => {
        const run = one.handler.latest();
        bench.clock.advance(one.settings.heartbeatMs);

        one.transactions.refuseNext();
        await one.worker.heartbeat();
        expect(run.context.signal.aborted).toBe(false);
        await one.worker.heartbeat();

        expect(bench.stored(jobId)).toMatchObject({
          lease_expires_at: bench.leaseEnd(one.settings),
        });
      });
    });
  });
});
