import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import type { EnqueueJobRequest } from '#ports/job-queue.port';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  scanOf,
  WIDGETS,
} from '#tests/support/queue-bench';
import { SchemaRows } from '#tests/support/schema-rows';

let bench: QueueBench;
let service: QueueProcess;

const SCAN = scanOf(WIDGETS, 'scan-1');

const ROLLBACK = 'The caller failed after the';

const WAIT_MS = 60_000;

beforeEach(async () => {
  bench = new QueueBench();
  service = await bench.open();
});

afterEach(() => {
  bench.remove();
});

describe('SqliteJobQueue', () => {
  describe('enqueue', () => {
    it('should add a pending job with no run and no lease', async () => {
      const result = await service.enqueue(SCAN);

      expect(result).toEqual({
        outcome: 'enqueued',
        jobId: '00000000-0000-4000-8000-000000000001',
      });
      expect(bench.stored(result.jobId)).toEqual({
        status: 'pending',
        runs: 0,
        lease_token: 0,
        lease_expires_at: null,
        progress: null,
        progress_updated_at: null,
        outcome: null,
      });
    });

    it('should keep the moment the job waits for', async () => {
      const notBefore = bench.clock.now().plusMilliseconds(WAIT_MS);

      const { jobId } = await service.enqueue({ ...SCAN, notBefore });

      expect(
        bench.connection
          .prepare('SELECT not_before FROM jobs WHERE id = ?')
          .get(jobId),
      ).toEqual({ not_before: notBefore.toString() });
    });

    describe('when the key is taken', () => {
      it('should name the job that holds it when the request is the same', async () => {
        const first = await service.enqueue(SCAN);

        const again = await service.enqueue({
          ...SCAN,
          payload: { branch: 'main', version: 1 },
        });

        expect(again).toEqual({ outcome: 'existing', jobId: first.jobId });
      });

      it.each<[string, Partial<EnqueueJobRequest>]>([
        ['kind', { kind: 'improvement' }],
        ['repository', { repositoryId: GADGETS }],
        ['payload', { payload: { version: 1, branch: 'next' } }],
      ])('should answer a conflict when the %s differs', async (_, change) => {
        const first = await service.enqueue(SCAN);

        const again = await service.enqueue({ ...SCAN, ...change });

        expect(again).toEqual({ outcome: 'conflict', jobId: first.jobId });
        expect(await service.queue.getJob(first.jobId)).toMatchObject({
          kind: 'scan',
          repositoryId: WIDGETS,
        });
      });
    });

    describe('when the transaction of the caller rolls back', () => {
      it('should leave no job', async () => {
        let jobId = '';

        await expect(
          service.transactions.run(async (transaction) => {
            jobId = (await service.queue.enqueue(SCAN, transaction)).jobId;
            throw new Error('The caller failed after the enqueue.');
          }),
        ).rejects.toThrow(ROLLBACK);

        expect(await service.queue.getJob(jobId)).toBeNull();
        expect(await service.enqueue(SCAN)).toMatchObject({
          outcome: 'enqueued',
        });
      });
    });
  });

  describe('cancel', () => {
    it('should cancel a waiting job in the transaction of the caller', async () => {
      const { jobId } = await service.enqueue(SCAN);

      await service.transactions.run(async (transaction) =>
        service.queue.cancel(jobId, transaction),
      );

      expect(bench.stored(jobId)).toMatchObject({ status: 'cancelled' });
    });

    it('should leave a job that has ended as it ended', async () => {
      const jobId = new SchemaRows(bench.connection).job({
        status: 'completed',
        serialization_key: WIDGETS.value,
      });

      await service.transactions.run(async (transaction) =>
        service.queue.cancel(jobId, transaction),
      );

      expect(bench.stored(jobId)).toMatchObject({ status: 'completed' });
    });

    it('should cancel nothing when the caller rolls back', async () => {
      const { jobId } = await service.enqueue(SCAN);

      await expect(
        service.transactions.run(async (transaction) => {
          await service.queue.cancel(jobId, transaction);
          throw new Error('The caller failed after the cancel.');
        }),
      ).rejects.toThrow(ROLLBACK);

      expect(bench.stored(jobId)).toMatchObject({ status: 'pending' });
    });
  });

  describe('getJob', () => {
    it('should give null for a job that does not exist', async () => {
      expect(await service.queue.getJob('missing')).toBeNull();
    });

    it('should give what the queue knows of a job', async () => {
      const { jobId } = await service.enqueue(SCAN);

      expect(await service.queue.getJob(jobId)).toEqual({
        id: jobId,
        kind: 'scan',
        repositoryId: WIDGETS,
        subjectId: 'scan-1',
        status: 'pending',
        runs: 0,
        outcome: null,
      });
    });

    it('should refuse a kind that the queue never stores', async () => {
      const jobId = new SchemaRows(bench.connection).job({
        kind: 'build',
        serialization_key: WIDGETS.value,
      });

      await expect(service.queue.getJob(jobId)).rejects.toThrow(
        new InvalidStoredJobError('"build" is not a kind of job.'),
      );
    });
  });

  describe('when a stored document has a version the queue does not know', () => {
    it('should store and give back the payload and the outcome as they are', async () => {
      const payload = { version: 99, shape: { added: ['later'] } };
      const outcome = { version: 42, found: null };
      const { jobId } = await service.enqueue({ ...SCAN, payload });

      await service.worker.poll();
      expect(service.handler.latest().context.payload).toEqual(payload);
      service.handler.latest().finish(outcome);
      await service.worker.whenIdle();

      expect(await service.queue.getJob(jobId)).toMatchObject({
        status: 'completed',
        outcome,
      });
    });
  });
});
