import type { Transaction } from '#kernel/transaction/transaction';
import {
  JobStoppedError,
  type JobStopReason,
} from '#ports/errors/job-stopped.error';
import { LeaseLostError } from '#ports/errors/lease-lost.error';
import type { JobContext } from '#ports/job-handler.port';
import type { JobDocument, JobProgress } from '#ports/job-queue.port';
import { InlineTransactions } from '#tests/support/inline-transactions';

/**
 * The context of a leased job with no queue behind it. A test stops it
 * as the worker would, takes its lease away, and reads what was reported.
 */
export class StandInJobContext implements JobContext {
  public readonly jobId = 'job-1';
  public readonly subjectId: string;
  public readonly leaseToken = 1;
  public readonly transactions = new InlineTransactions();
  public readonly reported: JobProgress[] = [];
  public payload: JobDocument = { version: 1 };
  /** A lost lease refuses every save from then on. */
  public leaseLost = false;
  private readonly controller = new AbortController();

  public constructor(subjectId: string) {
    this.subjectId = subjectId;
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public async commit<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    if (this.leaseLost) {
      throw new LeaseLostError('The job is no longer leased by this run.');
    }
    return this.transactions.run(operation);
  }

  public reportProgress(progress: JobProgress): void {
    this.reported.push(progress);
  }

  public stop(reason: JobStopReason): void {
    this.controller.abort(new JobStoppedError(reason));
  }
}
