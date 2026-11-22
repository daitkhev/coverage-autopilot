import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import { Instant } from '#kernel/time/instant';
import type { EnqueueJobRequest } from '#ports/job-queue.port';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  scanOf,
  START,
  WIDGETS,
} from '#tests/support/queue-bench';
import { SchemaRows, STORED_TIME } from '#tests/support/schema-rows';

let bench: QueueBench;
let service: QueueProcess;

const SCAN = scanOf(WIDGETS, 'scan-1');

const ROLLBACK = 'The caller failed after the';

const WAIT_MS = 60_000;

const STEP_MS = 1_000;

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

  describe('cancelSubject', () => {
    it('should cancel every job of the subject that has not ended', async () => {
      const first = await service.enqueue(SCAN);
      const second = await service.enqueue({
        ...SCAN,
        idempotencyKey: 'scan:scan-1:again',
      });
      const other = await service.enqueue(scanOf(GADGETS, 'scan-2'));

      await service.transactions.run(async (transaction) =>
        service.queue.cancelSubject('scan-1', transaction),
      );

      expect(bench.stored(first.jobId)).toMatchObject({ status: 'cancelled' });
      expect(bench.stored(second.jobId)).toMatchObject({ status: 'cancelled' });
      expect(bench.stored(other.jobId)).toMatchObject({ status: 'pending' });
    });

    it('should stop a job of the subject that a worker runs', async () => {
      const { jobId } = await service.enqueue(SCAN);
      await service.worker.poll();

      await service.transactions.run(async (transaction) =>
        service.queue.cancelSubject('scan-1', transaction),
      );

      expect(bench.stored(jobId)).toMatchObject({
        status: 'cancelled',
        lease_expires_at: null,
      });
    });

    it('should leave a job that has ended as it ended', async () => {
      const jobId = new SchemaRows(bench.connection).job({
        status: 'completed',
        subject_id: 'scan-1',
        serialization_key: WIDGETS.value,
      });

      await service.transactions.run(async (transaction) =>
        service.queue.cancelSubject('scan-1', transaction),
      );

      expect(bench.stored(jobId)).toMatchObject({ status: 'completed' });
    });
  });

  describe('getWait', () => {
    it('should give null when no job of the subject is pending', async () => {
      await service.enqueue(SCAN);
      await service.worker.poll();

      await expect(service.queue.getWait('scan-1')).resolves.toBeNull();
      await expect(service.queue.getWait('scan-9')).resolves.toBeNull();
    });

    it('should name a worker when nothing else holds the job', async () => {
      await service.enqueue(SCAN);

      await expect(service.queue.getWait('scan-1')).resolves.toBe('worker');
    });

    it('should name the repository when another of its jobs runs', async () => {
      await service.enqueue(scanOf(WIDGETS, 'scan-0'));
      await service.worker.poll();
      await service.enqueue(SCAN);

      await expect(service.queue.getWait('scan-1')).resolves.toBe('repository');
    });

    it('should name the moment until it comes', async () => {
      const notBefore = bench.clock.now().plusMilliseconds(WAIT_MS);
      await service.enqueue({ ...SCAN, notBefore });

      await expect(service.queue.getWait('scan-1')).resolves.toBe('moment');

      bench.clock.advance(WAIT_MS);

      await expect(service.queue.getWait('scan-1')).resolves.toBe('worker');
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
        createdAt: Instant.parse(START),
        startedAt: null,
        endedAt: null,
      });
    });

    it('should keep the first claim as the start through a later claim', async () => {
      const { jobId } = await service.enqueue(SCAN);
      bench.clock.advance(STEP_MS);
      await service.worker.poll();
      const firstClaim = bench.clock.now();
      service.handler.latest().retry();
      await service.worker.whenIdle();
      bench.clock.advance(STEP_MS);

      await service.worker.poll();

      expect(await service.queue.getJob(jobId)).toMatchObject({
        status: 'leased',
        runs: 2,
        startedAt: firstClaim,
        endedAt: null,
      });
    });

    it('should give the moment a job ended, which a later cancel keeps', async () => {
      const { jobId } = await service.enqueue(SCAN);
      await service.worker.poll();
      bench.clock.advance(STEP_MS);
      const end = bench.clock.now();
      service.handler.latest().finish();
      await service.worker.whenIdle();
      bench.clock.advance(STEP_MS);

      await service.transactions.run(async (transaction) =>
        service.queue.cancel(jobId, transaction),
      );

      expect(await service.queue.getJob(jobId)).toMatchObject({
        status: 'completed',
        endedAt: end,
      });
    });

    it.each(['completed', 'dead', 'cancelled'])(
      'should end a %s job at its last change',
      async (status) => {
        const jobId = new SchemaRows(bench.connection).job({
          status,
          serialization_key: WIDGETS.value,
          updated_at: STORED_TIME,
        });

        expect(await service.queue.getJob(jobId)).toMatchObject({
          endedAt: Instant.parse(STORED_TIME),
        });
      },
    );

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
