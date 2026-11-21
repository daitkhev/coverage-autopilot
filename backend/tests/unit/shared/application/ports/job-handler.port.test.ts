import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Transaction } from '#kernel/transaction/transaction';
import {
  type DeadJobContext,
  JOB_HANDLERS,
  type JobContext,
  type JobFinished,
  type JobHandler,
  type JobOutcome,
  type JobResult,
  type JobRetry,
  type RetryReason,
} from '#ports/job-handler.port';
import { JOB_QUEUE } from '#ports/job-queue.port';

function reasonOf(result: JobResult): RetryReason | undefined {
  return result.status === 'retry' ? result.reason : undefined;
}

describe('JobHandler', () => {
  it('should be injected as a list by a token of its own', () => {
    expect(JOB_HANDLERS.description).toBe('JobHandlers');
    expect(JOB_HANDLERS).not.toBe(JOB_QUEUE);
  });

  it('should tell a finished job from a retry by its status', () => {
    const retry: JobRetry = {
      status: 'retry',
      reason: { code: 'check_error', message: 'The mutation run timed out.' },
    };
    const finished: JobFinished = {
      status: 'finished',
      outcome: { version: 1 },
    };

    expect(reasonOf(retry)).toEqual(retry.reason);
    expect(reasonOf(finished)).toBeUndefined();
    expectTypeOf<JobResult>().toEqualTypeOf<JobFinished | JobRetry>();
  });

  it('should save through the lease of the job and give back the value', () => {
    type Commit = JobContext['commit'];

    expectTypeOf<Commit>()
      .parameter(0)
      .parameter(0)
      .toEqualTypeOf<Transaction>();
    expectTypeOf<ReturnType<JobHandler['execute']>>().toEqualTypeOf<
      Promise<JobResult>
    >();
    expectTypeOf<JobFinished['outcome']>().toEqualTypeOf<JobOutcome>();
  });

  it('should give a dead job no lease to save through', () => {
    expectTypeOf<DeadJobContext>().not.toHaveProperty('leaseToken');
    expectTypeOf<DeadJobContext>().not.toHaveProperty('commit');
    expectTypeOf<JobContext['leaseToken']>().toEqualTypeOf<number>();
  });
});
