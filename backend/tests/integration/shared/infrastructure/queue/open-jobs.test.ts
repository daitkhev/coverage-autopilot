import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import {
  GADGETS,
  QueueBench,
  type QueueProcess,
  WIDGETS,
} from '#tests/support/queue-bench';
import { type Row, SchemaRows } from '#tests/support/schema-rows';

const SUBJECT = 'subject-1';

const EARLIER = '2026-11-21T09:00:00.000Z';

const LATER = '2026-11-21T09:30:00.000Z';

/** A leased row holds a lease that runs out. */
const LEASED = { status: 'leased', lease_expires_at: LATER };

let bench: QueueBench;
let service: QueueProcess;
let rows: SchemaRows;

/** A job of WIDGETS about the subject, as a test sets it. */
function jobOf(row: Row): string {
  return rows.job({
    subject_id: SUBJECT,
    serialization_key: WIDGETS.value,
    ...row,
  });
}

beforeEach(async () => {
  bench = new QueueBench();
  service = await bench.open();
  rows = new SchemaRows(bench.connection);
});

afterEach(() => {
  bench.remove();
});

describe('SqliteJobQueue', () => {
  describe('getOpenJob', () => {
    it('should give null when the subject has no job of the kind', async () => {
      jobOf({ kind: 'improvement' });

      await expect(service.queue.getOpenJob(SUBJECT, 'scan')).resolves.toBe(
        null,
      );
      await expect(
        service.queue.getOpenJob('subject-9', 'improvement'),
      ).resolves.toBeNull();
    });

    it.each(['completed', 'dead', 'cancelled'])(
      'should give null when the only job is %s',
      async (status) => {
        jobOf({ status });

        await expect(
          service.queue.getOpenJob(SUBJECT, 'scan'),
        ).resolves.toBeNull();
      },
    );

    it('should give the oldest pending job when none is leased', async () => {
      jobOf({ created_at: LATER });
      const oldest = jobOf({ created_at: EARLIER });

      expect(await service.queue.getOpenJob(SUBJECT, 'scan')).toMatchObject({
        id: oldest,
        kind: 'scan',
        repositoryId: WIDGETS,
        subjectId: SUBJECT,
        status: 'pending',
      });
    });

    it('should give the leased job before an older pending one', async () => {
      jobOf({ created_at: EARLIER });
      const leased = jobOf({ created_at: LATER, ...LEASED });

      expect(await service.queue.getOpenJob(SUBJECT, 'scan')).toMatchObject({
        id: leased,
        status: 'leased',
      });
    });
  });

  describe('countRunning', () => {
    it('should count none of each kind when no job is leased', async () => {
      jobOf({ status: 'pending' });
      jobOf({ status: 'completed', kind: 'improvement' });

      expect(await service.queue.countRunning()).toEqual({
        scan: 0,
        improvement: 0,
      });
    });

    it('should count the leased jobs of each kind', async () => {
      jobOf(LEASED);
      rows.job({ ...LEASED, serialization_key: GADGETS.value });
      rows.job({ ...LEASED, kind: 'improvement' });

      expect(await service.queue.countRunning()).toEqual({
        scan: 2,
        improvement: 1,
      });
    });

    it('should refuse a kind that the queue never stores', async () => {
      jobOf({ ...LEASED, kind: 'build' });

      await expect(service.queue.countRunning()).rejects.toThrow(
        new InvalidStoredJobError('"build" is not a kind of job.'),
      );
    });
  });
});
