import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import {
  type EnqueueJobRequest,
  type EnqueueJobResult,
  JOB_QUEUE,
  type JobDocument,
  type JobDto,
  type JobProgressDto,
  type JobQueue,
} from '#ports/job-queue.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';

describe('JobQueue', () => {
  it('should be injected by a token of its own', () => {
    expect(JOB_QUEUE.description).toBe('JobQueue');
    expect(JOB_QUEUE).not.toBe(TRANSACTION_MANAGER);
  });

  it('should put a job in the transaction of the caller', () => {
    expectTypeOf<JobQueue['enqueue']>()
      .parameter(1)
      .toEqualTypeOf<Transaction>();
    expectTypeOf<JobQueue['cancel']>()
      .parameter(1)
      .toEqualTypeOf<Transaction>();
  });

  it('should take a payload only with the version of its schema', () => {
    expectTypeOf({ version: 1, files: ['src/a.ts'] }).toExtend<JobDocument>();
    expectTypeOf<{ files: string[] }>().not.toExtend<JobDocument>();
    expectTypeOf<EnqueueJobRequest['payload']>().toEqualTypeOf<JobDocument>();
  });

  it('should take JSON only in a payload', () => {
    expectTypeOf<{ version: 1; at: Date }>().not.toExtend<JobDocument>();
  });

  it('should answer a reused key with a value, not an error', () => {
    expectTypeOf<EnqueueJobResult['outcome']>().toEqualTypeOf<
      'enqueued' | 'existing' | 'conflict'
    >();
  });

  it('should know the statuses the database allows, and no other', () => {
    expectTypeOf<JobDto['status']>().toEqualTypeOf<
      'pending' | 'leased' | 'completed' | 'dead' | 'cancelled'
    >();
  });

  it('should give when a job was queued, and when it started and ended once it did', () => {
    expectTypeOf<JobDto['createdAt']>().toEqualTypeOf<Instant>();
    expectTypeOf<JobDto['startedAt']>().toEqualTypeOf<Instant | null>();
    expectTypeOf<JobDto['endedAt']>().toEqualTypeOf<Instant | null>();
  });

  it('should report the steps of a check with the statuses of a check', () => {
    type Step = JobProgressDto['steps'][number];

    expectTypeOf<Step['status']>().toEqualTypeOf<
      | 'pending'
      | 'running'
      | 'passed'
      | 'failed'
      | 'skipped'
      | 'not_applicable'
      | 'error'
    >();
    expectTypeOf<JobProgressDto['updatedAt']>().toEqualTypeOf<Instant>();
  });
});
